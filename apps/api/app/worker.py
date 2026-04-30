"""arq worker 設定。"""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import settings
from app.core.db import db_session
from app.core.logging import configure_logging, get_logger
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.services.email import send_kyc_approved, send_kyc_rejected
from app.services.ledger import post_deposit

logger = get_logger(__name__)


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


async def confirm_onchain_tx(ctx: dict[str, Any], *, onchain_tx_id: int) -> str:
    """Phase 3C-1 mock 版:任務一被執行就直接升 POSTED。

    Phase 3C-2 會改成:查 Tatum 拿目前 block height → 算 confirmations → 不夠 19 block 就 reschedule。
    """
    async with db_session() as session:
        result = await session.execute(select(OnchainTx).where(OnchainTx.id == onchain_tx_id))
        onchain_tx = result.scalar_one_or_none()
        if onchain_tx is None:
            logger.warning("confirm_onchain_tx_not_found", onchain_tx_id=onchain_tx_id)
            return "not_found"
        if onchain_tx.status == OnchainTxStatus.POSTED.value:
            logger.info("confirm_onchain_tx_already_posted", onchain_tx_id=onchain_tx_id)
            return "already_posted"
        if onchain_tx.status != OnchainTxStatus.PROVISIONAL.value:
            logger.warning(
                "confirm_onchain_tx_unexpected_status",
                onchain_tx_id=onchain_tx_id,
                status=onchain_tx.status,
            )
            return "unexpected_status"

        # Mock confirmations 達到 19
        onchain_tx.confirmations = 19
        await post_deposit(session, onchain_tx)

    logger.info("confirm_onchain_tx_posted", onchain_tx_id=onchain_tx_id)
    return "posted"


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
        confirm_onchain_tx,
    ]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
