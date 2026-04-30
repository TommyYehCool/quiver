"""arq worker 設定。"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Any

from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import settings
from app.core.db import db_session
from app.core.logging import configure_logging, get_logger
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
from app.services import tatum
from app.services.email import send_kyc_approved, send_kyc_rejected, send_transfer_received
from app.services.ledger import post_deposit
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import load_user_signing_keys
from app.services.withdrawal import (
    fail_and_reverse_withdrawal,
    mark_broadcasting,
    mark_completed,
    mark_processing,
)

logger = get_logger(__name__)

# Tron 出塊 ~3 秒,規格要求 19 confirmations
REQUIRED_CONFIRMATIONS = 19
TRON_BLOCK_SECONDS = 3

# 提領前要 user 地址有多少 TRX 才送(不夠就從 FEE_PAYER 補足)
WITHDRAWAL_TRX_BUDGET = Decimal("30")


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


async def broadcast_withdrawal(ctx: dict[str, Any], *, withdrawal_id: int) -> str:
    """簽 + 廣播提領上鏈。

    流程:
      1. APPROVED → PROCESSING(防止 double-broadcast)
      2. 派生 user + FEE_PAYER private keys
      3. 若 user 的 TRX 不足 30,從 FEE_PAYER 補足
      4. 等 TRX top-up 上鏈(~10s)
      5. 從 user 地址送 USDT 到 to_address
      6. 寫 tx_hash + status=BROADCASTING + 排程 confirm_withdrawal
      7. 任何環節 raise → fail_and_reverse_withdrawal
    """
    # Step 1: 鎖定 + 改 PROCESSING
    async with db_session() as session:
        req = await mark_processing(session, withdrawal_id)
    if req is None:
        logger.info("broadcast_skipped_not_approved", withdrawal_id=withdrawal_id)
        return "not_approved"

    user_priv = ""
    fp_priv = ""
    try:
        # Step 2: 拿 keys
        async with db_session() as session:
            user_addr, user_priv, fp_addr, fp_priv = await load_user_signing_keys(
                session, req.user_id
            )

        # Step 3-4: TRX top-up if needed
        try:
            user_trx = await tatum.get_trx_balance(user_addr)
        except TatumError as e:
            raise RuntimeError(f"get_trx_balance failed: {e}") from e

        if user_trx < WITHDRAWAL_TRX_BUDGET:
            top_up_amount = WITHDRAWAL_TRX_BUDGET - user_trx
            logger.info(
                "trx_top_up_starting",
                withdrawal_id=withdrawal_id,
                user_addr=user_addr,
                from_balance=str(user_trx),
                top_up=str(top_up_amount),
            )
            top_up_hash = await tatum.send_trx(fp_priv, user_addr, top_up_amount)
            logger.info(
                "trx_top_up_broadcast",
                withdrawal_id=withdrawal_id,
                top_up_tx=top_up_hash,
            )
            # Tron 出塊 ~3s,等大概 4 個 block 確保 user 看到 TRX
            await asyncio.sleep(12)

        # Step 5: send USDT
        logger.info(
            "withdrawal_send_usdt",
            withdrawal_id=withdrawal_id,
            from_addr=user_addr,
            to_addr=req.to_address,
            amount=str(req.amount),
        )
        usdt_tx_hash = await tatum.send_trc20(
            user_priv,
            req.to_address,
            settings.usdt_contract,
            req.amount,
            fee_limit_trx=100,
        )

    except Exception as e:
        logger.exception("withdrawal_broadcast_failed", withdrawal_id=withdrawal_id, error=str(e))
        async with db_session() as session:
            await fail_and_reverse_withdrawal(session, withdrawal_id, f"broadcast: {e}")
        return f"failed:{e}"
    finally:
        # 盡量縮短 priv key 在記憶體的時間(Python GC 不一定立刻收)
        user_priv = "0" * 64  # noqa: F841
        fp_priv = "0" * 64  # noqa: F841

    # Step 6: 寫 tx_hash + 排 confirm
    async with db_session() as session:
        await mark_broadcasting(session, withdrawal_id, usdt_tx_hash)

    redis = ctx["redis"]
    await redis.enqueue_job(
        "confirm_withdrawal",
        withdrawal_id=withdrawal_id,
        _defer_by=15,
    )
    logger.info(
        "withdrawal_broadcast_done",
        withdrawal_id=withdrawal_id,
        tx_hash=usdt_tx_hash,
    )
    return f"broadcast:{usdt_tx_hash}"


async def confirm_withdrawal(ctx: dict[str, Any], *, withdrawal_id: int) -> str:
    """polling tx confirmations,夠 19 → COMPLETED。"""
    async with db_session() as session:
        q = await session.execute(
            select(WithdrawalRequest).where(WithdrawalRequest.id == withdrawal_id)
        )
        req = q.scalar_one_or_none()
        if req is None:
            return "not_found"
        if req.status == WithdrawalStatus.COMPLETED.value:
            return "already_completed"
        if req.status != WithdrawalStatus.BROADCASTING.value:
            return f"unexpected_status_{req.status}"
        if not req.tx_hash:
            await fail_and_reverse_withdrawal(session, withdrawal_id, "missing tx_hash")
            return "missing_tx_hash"
        tx_hash = req.tx_hash

    try:
        detail = await tatum.get_tron_transaction(tx_hash)
    except TatumNotConfigured:
        return "tatum_not_configured"
    except TatumError as e:
        logger.warning("confirm_withdrawal_tatum_error", withdrawal_id=withdrawal_id, error=str(e))
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=30
        )
        return "tatum_error_retry"

    if detail is None:
        # 還沒被 Tatum index 到,過 10 秒再來
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=10
        )
        return "tx_not_indexed_yet"

    block_number = detail.get("blockNumber")
    if not block_number:
        # tx pending(尚未上塊)
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=15
        )
        return "tx_pending"

    # 檢查 contract 執行有沒有失敗
    ret = detail.get("ret")
    if isinstance(ret, list) and ret:
        contract_ret = ret[0].get("contractRet", "SUCCESS")
        if contract_ret != "SUCCESS":
            async with db_session() as session:
                await fail_and_reverse_withdrawal(
                    session, withdrawal_id, f"chain ret={contract_ret}"
                )
            return f"chain_failed_{contract_ret}"

    try:
        current_block = await tatum.get_tron_block_number()
    except TatumError as e:
        logger.warning("confirm_withdrawal_block_height_error", error=str(e))
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=30
        )
        return "tatum_error_retry"

    confirmations = max(0, current_block - block_number)
    if confirmations >= REQUIRED_CONFIRMATIONS:
        async with db_session() as session:
            await mark_completed(session, withdrawal_id)
        logger.info(
            "withdrawal_completed",
            withdrawal_id=withdrawal_id,
            tx_hash=tx_hash,
            confirmations=confirmations,
        )
        return "completed"

    # 不夠就 reschedule
    blocks_left = REQUIRED_CONFIRMATIONS - confirmations
    defer = max(15, blocks_left * TRON_BLOCK_SECONDS + 5)
    logger.info(
        "withdrawal_waiting_confirmations",
        withdrawal_id=withdrawal_id,
        confirmations=confirmations,
        blocks_left=blocks_left,
        next_check_in=defer,
    )
    await ctx["redis"].enqueue_job(
        "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=defer
    )
    return f"waiting_{confirmations}"


async def _recover_orphan_withdrawals(ctx: dict[str, Any]) -> None:
    """Worker 啟動時掃 APPROVED + PROCESSING + BROADCASTING 的 withdrawal,重新排程。

    APPROVED:可能是 worker 上次 crash 之前還沒 broadcast 的,直接重排
    PROCESSING:worker 卡在 broadcast 中間時 crash → 重排,但這段不安全(可能已部分上鏈)
                phase 5C 會用 idempotency key 處理。phase 5B 簡單版:也直接重排,讓人工檢查
    BROADCASTING:已上鏈但 confirm task 沒跑到,重排 confirm 即可
    """
    redis = ctx["redis"]
    async with db_session() as session:
        q = await session.execute(
            select(WithdrawalRequest).where(
                WithdrawalRequest.status.in_(
                    [
                        WithdrawalStatus.APPROVED.value,
                        WithdrawalStatus.PROCESSING.value,
                        WithdrawalStatus.BROADCASTING.value,
                    ]
                )
            )
        )
        rows = q.scalars().all()

    for req in rows:
        if req.status == WithdrawalStatus.BROADCASTING.value:
            await redis.enqueue_job(
                "confirm_withdrawal", withdrawal_id=req.id, _defer_by=5
            )
            logger.info("orphan_confirm_rescheduled", withdrawal_id=req.id)
        else:
            # APPROVED / PROCESSING — 重新進 broadcast 流程
            await redis.enqueue_job(
                "broadcast_withdrawal", withdrawal_id=req.id, _defer_by=5
            )
            logger.info(
                "orphan_broadcast_rescheduled",
                withdrawal_id=req.id,
                from_status=req.status,
            )


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    get_logger(__name__).info("worker_starting")
    try:
        await _recover_orphan_withdrawals(ctx)
    except Exception as e:
        logger.exception("orphan_recovery_failed", error=str(e))


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
        broadcast_withdrawal,
        confirm_withdrawal,
    ]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
