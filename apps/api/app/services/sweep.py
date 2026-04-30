"""Sweep — 把 user 派生地址鏈上的 USDT 移到 HOT wallet。

設計:
- 入金到 user.tron_address 後,sweep 任務搬移 USDT 到 HOT
- 任何時候,user 鏈上應該 ≈ 0(只有少量 TRX 餘額殘留),平台 USDT 統一在 HOT
- 提領全部從 HOT 出,不從 user 出

Sweep 不動 ledger:USDT 從 platform 一個地址(user.tron_address)挪到另一個(HOT),
平台總 custody 沒變。Ledger 上的 PLATFORM_CUSTODY 反映的是「總共持有」,不分地址。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.services import tatum
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import (
    _derive_fee_payer_private_key_hex,
    _derive_platform_fee_payer_address,
    _derive_platform_hot_wallet_address,
    _derive_tron_address,
    _derive_user_private_key_hex,
    _load_master_seed,
)

logger = get_logger(__name__)

# 鏈上 USDT < 此門檻就不掃(避免 fee 大於 sweep 金額)
SWEEP_MIN_USDT = Decimal("10")
# Sweep 前 user 地址至少要有多少 TRX(沒有就從 FEE_PAYER 補)
SWEEP_TRX_BUDGET = Decimal("30")


@dataclass
class SweepResult:
    user_id: int
    address: str
    swept_amount: Decimal
    tx_hash: str | None
    skipped_reason: str | None = None


async def sweep_user_to_hot(db: AsyncSession, user_id: int) -> SweepResult:
    """掃一個 user 的鏈上 USDT 到 HOT wallet。

    流程:
      1. 查 user 鏈上 USDT 餘額
      2. < SWEEP_MIN_USDT 就跳過
      3. 派生 user / FEE_PAYER / HOT 地址 + private keys
      4. 若 user TRX < BUDGET,從 FEE_PAYER 補足 + 等 12s 上鏈
      5. user 簽 USDT transfer 全額給 HOT
      6. 回 tx_hash(不等 confirmation,假設 Tatum accept 就會上)
    """
    q = await db.execute(select(User).where(User.id == user_id))
    user = q.scalar_one_or_none()
    if user is None or not user.tron_address:
        return SweepResult(user_id=user_id, address="", swept_amount=Decimal("0"), tx_hash=None, skipped_reason="no_address")

    user_addr = user.tron_address

    # Step 1: 查鏈上 USDT 餘額
    try:
        chain_usdt = await tatum.get_trc20_balance(user_addr, settings.usdt_contract)
    except (TatumError, TatumNotConfigured) as e:
        logger.warning("sweep_get_balance_failed", user_id=user_id, error=str(e))
        return SweepResult(user_id=user_id, address=user_addr, swept_amount=Decimal("0"), tx_hash=None, skipped_reason=f"balance_fetch_failed:{e}")

    if chain_usdt < SWEEP_MIN_USDT:
        return SweepResult(user_id=user_id, address=user_addr, swept_amount=chain_usdt, tx_hash=None, skipped_reason="below_threshold")

    # Step 2: 派生 keys
    master_seed = await _load_master_seed(db)
    try:
        user_priv = _derive_user_private_key_hex(master_seed, user_id)
        fp_addr = _derive_platform_fee_payer_address(master_seed)
        fp_priv = _derive_fee_payer_private_key_hex(master_seed)
        hot_addr = _derive_platform_hot_wallet_address(master_seed)
    finally:
        master_seed = b"\x00" * len(master_seed)  # noqa: F841

    try:
        # Step 3: TRX top-up if needed
        try:
            user_trx = await tatum.get_trx_balance(user_addr)
        except TatumError:
            user_trx = Decimal("0")  # 假設 0,該補就補

        if user_trx < SWEEP_TRX_BUDGET:
            top_up = SWEEP_TRX_BUDGET - user_trx
            logger.info(
                "sweep_trx_top_up",
                user_id=user_id,
                user_addr=user_addr,
                top_up=str(top_up),
            )
            await tatum.send_trx(fp_priv, user_addr, top_up)
            await asyncio.sleep(12)

        # Step 4: send all USDT to HOT
        logger.info(
            "sweep_send_usdt",
            user_id=user_id,
            from_addr=user_addr,
            to_addr=hot_addr,
            amount=str(chain_usdt),
        )
        tx_hash = await tatum.send_trc20(
            user_priv,
            hot_addr,
            settings.usdt_contract,
            chain_usdt,
            fee_limit_trx=100,
        )
    except Exception as e:
        logger.exception("sweep_failed", user_id=user_id, error=str(e))
        return SweepResult(user_id=user_id, address=user_addr, swept_amount=Decimal("0"), tx_hash=None, skipped_reason=f"send_failed:{e}")
    finally:
        # Zero out priv keys
        user_priv = "0" * 64  # noqa: F841
        fp_priv = "0" * 64  # noqa: F841

    logger.info(
        "sweep_done",
        user_id=user_id,
        amount=str(chain_usdt),
        tx_hash=tx_hash,
    )
    return SweepResult(user_id=user_id, address=user_addr, swept_amount=chain_usdt, tx_hash=tx_hash, skipped_reason=None)


async def list_sweepable_users(db: AsyncSession) -> list[User]:
    """所有有 tron_address 的 user — 候選名單。實際會不會 sweep 看 chain balance。"""
    q = await db.execute(select(User).where(User.tron_address.is_not(None)))
    return list(q.scalars().all())
