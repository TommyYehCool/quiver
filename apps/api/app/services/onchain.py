"""鏈上事件處理 service — 從 webhook payload 走到 DB row。"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.models.user import User

logger = get_logger(__name__)


async def record_provisional_deposit(
    db: AsyncSession,
    *,
    tx_hash: str,
    to_address: str,
    amount: Decimal,
    currency: str,
    block_number: int | None,
    raw_payload: dict[str, Any],
) -> OnchainTx | None:
    """收到入金通知 → 找對應 user → 插 PROVISIONAL 紀錄。

    冪等:tx_hash 已存在則回 None(代表重複通知)。
    地址找不到對應 user 則回 None(別人的地址,不是我們的客戶)。
    """
    existing_q = await db.execute(select(OnchainTx).where(OnchainTx.tx_hash == tx_hash))
    existing = existing_q.scalar_one_or_none()
    if existing is not None:
        logger.info("onchain_tx_duplicate", tx_hash=tx_hash, existing_id=existing.id)
        return None

    user_q = await db.execute(select(User).where(User.tron_address == to_address))
    user = user_q.scalar_one_or_none()
    if user is None:
        logger.warning("onchain_tx_no_matching_user", tx_hash=tx_hash, to_address=to_address)
        return None

    if amount <= 0:
        logger.warning("onchain_tx_non_positive_amount", tx_hash=tx_hash, amount=str(amount))
        return None

    onchain_tx = OnchainTx(
        tx_hash=tx_hash,
        user_id=user.id,
        to_address=to_address,
        amount=amount,
        currency=currency,
        block_number=block_number,
        status=OnchainTxStatus.PROVISIONAL.value,
        raw_payload=raw_payload,
    )
    db.add(onchain_tx)
    await db.commit()
    await db.refresh(onchain_tx)

    logger.info(
        "onchain_tx_recorded",
        onchain_tx_id=onchain_tx.id,
        tx_hash=tx_hash,
        user_id=user.id,
        amount=str(amount),
    )
    return onchain_tx
