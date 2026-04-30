"""Admin platform endpoints — FEE_PAYER 地址 + TRX 餘額。

phase 5A 只看;phase 5C 會加告警 / 阻擋新提領。
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.api import ApiResponse
from app.schemas.withdrawal import FeePayerInfo, HotWalletInfo
from app.services import tatum
from app.services.platform import FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import (
    WalletError,
    get_platform_fee_payer_address,
    get_platform_hot_wallet_address,
)

router = APIRouter(prefix="/api/admin/platform", tags=["admin-platform"])
logger = get_logger(__name__)


@router.get("/fee-payer", response_model=ApiResponse[FeePayerInfo])
async def get_fee_payer(_: CurrentAdminDep, db: DbDep) -> ApiResponse[FeePayerInfo]:
    try:
        address = await get_platform_fee_payer_address(db)
    except WalletError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "wallet.systemNotReady", "message": str(e)},
        ) from e

    trx_balance: Decimal = Decimal("0")
    try:
        trx_balance = await tatum.get_trx_balance(address)
    except TatumNotConfigured:
        logger.warning("fee_payer_tatum_not_configured")
    except TatumError as e:
        logger.warning("fee_payer_tatum_error", error=str(e))

    return ApiResponse[FeePayerInfo].ok(
        FeePayerInfo(
            address=address,
            trx_balance=trx_balance,
            network=settings.env,
            low_balance_warning=trx_balance < FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL,
        )
    )


@router.get("/hot-wallet", response_model=ApiResponse[HotWalletInfo])
async def get_hot_wallet(_: CurrentAdminDep, db: DbDep) -> ApiResponse[HotWalletInfo]:
    """HOT wallet 地址 + USDT/TRX 餘額 + 用戶 ledger 拆解。

    所有提領從這裡出,所有 sweep 把 user 鏈上 USDT 集中到這裡。
    顯示 user_balances_total / platform_profit 讓 admin 一眼看出資金結構:
      HOT_USDT = sum(user ledger) + 累計手續費(平台獲利)
    """
    from app.services.ledger import get_total_user_balance

    try:
        address = await get_platform_hot_wallet_address(db)
    except WalletError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "wallet.systemNotReady", "message": str(e)},
        ) from e

    usdt_balance: Decimal = Decimal("0")
    trx_balance: Decimal = Decimal("0")
    try:
        usdt_balance = await tatum.get_trc20_balance(address, settings.usdt_contract)
        trx_balance = await tatum.get_trx_balance(address)
    except TatumNotConfigured:
        logger.warning("hot_wallet_tatum_not_configured")
    except TatumError as e:
        logger.warning("hot_wallet_tatum_error", error=str(e))

    user_balances_total = await get_total_user_balance(db)
    platform_profit = usdt_balance - user_balances_total

    return ApiResponse[HotWalletInfo].ok(
        HotWalletInfo(
            address=address,
            usdt_balance=usdt_balance,
            trx_balance=trx_balance,
            network=settings.env,
            user_balances_total=user_balances_total,
            platform_profit=platform_profit,
        )
    )
