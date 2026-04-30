"""平台帳戶健康監控 — phase 5C 加入,擋下不安全的提領。

統一在這裡定義 threshold,admin endpoint 跟 submit_withdrawal 都從這裡讀。
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services import tatum
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import WalletError, get_platform_fee_payer_address

logger = get_logger(__name__)

# FEE_PAYER 低於這個 TRX 量就阻擋新提領 + 紅色 banner
# 每筆提領大概燒 ~14 TRX gas,留 100 TRX buffer 給 ~7 筆提領
FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL = Decimal("100")


async def get_fee_payer_balance(db: AsyncSession) -> Decimal | None:
    """取 FEE_PAYER 的 TRX 餘額。任何錯誤回 None(讓 caller 決定要 fail-open 還是 fail-closed)。"""
    try:
        addr = await get_platform_fee_payer_address(db)
    except WalletError as e:
        logger.warning("fee_payer_balance_addr_failed", error=str(e))
        return None

    try:
        return await tatum.get_trx_balance(addr)
    except TatumNotConfigured:
        logger.warning("fee_payer_balance_tatum_not_configured")
        return None
    except TatumError as e:
        logger.warning("fee_payer_balance_tatum_error", error=str(e))
        return None


async def is_fee_payer_healthy(db: AsyncSession) -> bool:
    """新提領前的 health check。

    Fail-open 設計:Tatum 暫時掛了 / 系統未初始化 → 回 True 不擋。
    只有「明確查到餘額且低於 threshold」才回 False。
    這樣監控失常時不會誤擋使用者,但餘額真的不夠時擋得住。
    """
    bal = await get_fee_payer_balance(db)
    if bal is None:
        return True  # 不確定,允許通過(不阻擋業務)
    is_healthy = bal >= FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL
    if not is_healthy:
        logger.warning(
            "fee_payer_unhealthy_blocking_withdrawal",
            balance=str(bal),
            threshold=str(FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL),
        )
    return is_healthy
