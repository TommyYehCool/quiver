"""arq worker 設定。"""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import settings
from app.core.db import db_session
from app.core.logging import configure_logging, get_logger
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.services import tatum
from app.services.email import send_kyc_approved, send_kyc_rejected, send_transfer_received
from app.services.ledger import post_deposit
from app.services.tatum import TatumError, TatumNotConfigured

logger = get_logger(__name__)

# Tron 出塊 ~3 秒,規格要求 19 confirmations
REQUIRED_CONFIRMATIONS = 19
TRON_BLOCK_SECONDS = 3


async def noop(ctx: dict[str, Any]) -> str:
    """Placeholder。"""
    return "noop"


async def kyc_send_approved_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
) -> bool:
    return await send_kyc_approved(to=to, display_name=display_name)


async def kyc_send_rejected_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
    reason: str,
) -> bool:
    return await send_kyc_rejected(to=to, display_name=display_name, reason=reason)


async def transfer_send_received_email(
    ctx: dict[str, Any],
    *,
    to: str,
    sender_email: str,
    sender_display_name: str | None,
    amount: str,
    currency: str,
    note: str | None,
) -> bool:
    return await send_transfer_received(
        to=to,
        sender_email=sender_email,
        sender_display_name=sender_display_name,
        amount=amount,
        currency=currency,
        note=note,
    )


async def _reschedule_confirm(
    ctx: dict[str, Any], onchain_tx_id: int, defer_seconds: int
) -> None:
    """重排自己,等等再來查。"""
    redis = ctx["redis"]
    await redis.enqueue_job(
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx_id,
        _defer_by=defer_seconds,
    )


async def confirm_onchain_tx(ctx: dict[str, Any], *, onchain_tx_id: int) -> str:
    """查 Tron 鏈確認情況,夠 19 block 就升 POSTED。

    流程:
      1. 沒 block_number → 從 Tatum 查 tx,還沒上鏈就 retry 10s 後
      2. 拿當前 block height → 算 confirmations
      3. ≥ 19 → post_deposit
      4. < 19 → 重排自己,延遲 = 還缺幾 block × 3 秒 + 5 秒 buffer
      5. Tatum 沒設 / 報錯 → log 並 retry 30s 後
    """
    async with db_session() as session:
        result = await session.execute(select(OnchainTx).where(OnchainTx.id == onchain_tx_id))
        onchain_tx = result.scalar_one_or_none()
        if onchain_tx is None:
            logger.warning("confirm_onchain_tx_not_found", onchain_tx_id=onchain_tx_id)
            return "not_found"
        if onchain_tx.status == OnchainTxStatus.POSTED.value:
            return "already_posted"
        if onchain_tx.status != OnchainTxStatus.PROVISIONAL.value:
            logger.warning(
                "confirm_onchain_tx_unexpected_status",
                onchain_tx_id=onchain_tx_id,
                status=onchain_tx.status,
            )
            return "unexpected_status"

        # ---- block_number 未知 → 從 Tatum 查 tx ----
        if onchain_tx.block_number is None:
            try:
                detail = await tatum.get_tron_transaction(onchain_tx.tx_hash)
            except TatumNotConfigured:
                logger.warning(
                    "confirm_onchain_tx_tatum_not_configured",
                    onchain_tx_id=onchain_tx_id,
                )
                # 沒 Tatum 就維持 PROVISIONAL,要靠 dev simulator 或 admin 手動 post
                return "tatum_not_configured"
            except TatumError as e:
                logger.warning(
                    "confirm_onchain_tx_tatum_get_tx_failed",
                    onchain_tx_id=onchain_tx_id,
                    error=str(e),
                )
                await _reschedule_confirm(ctx, onchain_tx_id, 30)
                return "tatum_error_retry"

            if detail is None or not detail.get("blockNumber"):
                # tx 還沒上鏈,10 秒後再來
                logger.info(
                    "confirm_onchain_tx_tx_not_yet_mined",
                    onchain_tx_id=onchain_tx_id,
                )
                await _reschedule_confirm(ctx, onchain_tx_id, 10)
                return "not_yet_mined"

            onchain_tx.block_number = int(detail["blockNumber"])
            await session.commit()

        # ---- 拿當前 block height,算 confirmations ----
        try:
            current_block = await tatum.get_tron_block_number()
        except TatumNotConfigured:
            return "tatum_not_configured"
        except TatumError as e:
            logger.warning(
                "confirm_onchain_tx_tatum_block_failed",
                onchain_tx_id=onchain_tx_id,
                error=str(e),
            )
            await _reschedule_confirm(ctx, onchain_tx_id, 30)
            return "tatum_error_retry"

        confirmations = max(0, current_block - onchain_tx.block_number)
        onchain_tx.confirmations = confirmations

        if confirmations >= REQUIRED_CONFIRMATIONS:
            await post_deposit(session, onchain_tx)
            logger.info(
                "confirm_onchain_tx_posted",
                onchain_tx_id=onchain_tx_id,
                confirmations=confirmations,
            )
            return "posted"

        await session.commit()

    # 還沒夠 — 算還要等幾秒
    blocks_left = REQUIRED_CONFIRMATIONS - confirmations
    defer = max(15, blocks_left * TRON_BLOCK_SECONDS + 5)
    logger.info(
        "confirm_onchain_tx_waiting",
        onchain_tx_id=onchain_tx_id,
        confirmations=confirmations,
        blocks_left=blocks_left,
        next_check_in=defer,
    )
    await _reschedule_confirm(ctx, onchain_tx_id, defer)
    return f"waiting_{confirmations}"


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    get_logger(__name__).info("worker_starting")


async def shutdown(ctx: dict[str, Any]) -> None:
    get_logger(__name__).info("worker_stopping")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


class WorkerSettings:
    functions = [
        noop,
        kyc_send_approved_email,
        kyc_send_rejected_email,
        transfer_send_received_email,
        confirm_onchain_tx,
    ]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
