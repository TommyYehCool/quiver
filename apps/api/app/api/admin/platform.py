"""Admin platform endpoints — FEE_PAYER 地址 + TRX 餘額 + HOT 平台獲利提領。

phase 5A 只看;phase 5C 會加告警 / 阻擋新提領;phase 6E-2.5 加 fee withdrawal。
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.schemas.api import ApiResponse
from app.schemas.withdrawal import FeePayerInfo, HotWalletInfo
from app.services import tatum
from app.services.audit import write_audit
from app.services.platform import FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL
from app.services.platform_outbound import (
    OutboundError,
    OutboundPurpose,
    compute_quota,
    send_platform_outbound,
)
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import (
    WalletError,
    get_platform_fee_payer_address,
    get_platform_hot_wallet_address,
)
from fastapi import Depends

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


# ---------- Phase 6E-2.5: 提領平台獲利 ----------


class FeeWithdrawIn(BaseModel):
    to_address: str = Field(min_length=34, max_length=34)
    amount: Decimal = Field(gt=0)
    totp_code: str | None = Field(default=None, max_length=20)


class FeeWithdrawOut(BaseModel):
    tx_hash: str
    amount: Decimal
    to_address: str


class OutboundQuotaOut(BaseModel):
    hot_usdt_balance: Decimal
    user_balances_total: Decimal
    platform_profit: Decimal
    fee_withdrawal_max: Decimal


@router.get("/fee-withdraw/quota", response_model=ApiResponse[OutboundQuotaOut])
async def get_outbound_quota(
    _: CurrentAdminDep, db: DbDep,
) -> ApiResponse[OutboundQuotaOut]:
    """看現在最多可提多少平台獲利(=HOT 鏈上 - 全用戶 ledger)。"""
    try:
        q = await compute_quota(db)
    except OutboundError as e:
        raise HTTPException(
            status_code=e.http_status, detail={"code": e.code, "params": e.params}
        ) from e
    return ApiResponse[OutboundQuotaOut].ok(
        OutboundQuotaOut(
            hot_usdt_balance=q.hot_usdt_balance,
            user_balances_total=q.user_balances_total,
            platform_profit=q.platform_profit,
            fee_withdrawal_max=q.fee_withdrawal_max,
        )
    )


@router.post(
    "/fee-withdraw",
    response_model=ApiResponse[FeeWithdrawOut],
    dependencies=[Depends(rate_limit("platform_fee_withdraw", limit=10, window=600))],
)
async def fee_withdraw(
    payload: FeeWithdrawIn,
    request: Request,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[FeeWithdrawOut]:
    """提領平台獲利到指定地址。

    安全機制:
      - admin 必驗(CurrentAdminDep)
      - 若 admin 有開 2FA,必驗 totp_code
      - amount 不能超過 platform_profit(永遠不會碰到用戶資金)
      - 寫 audit log
      - rate-limit 每 10 分鐘 10 次

    阻塞 ~12-15 秒(等 TRX top-up 上鏈),完成後回 tx_hash。
    """
    try:
        result = await send_platform_outbound(
            db,
            admin=admin,
            purpose=OutboundPurpose.FEE_WITHDRAWAL,
            to_address=payload.to_address,
            amount=payload.amount,
            totp_code=payload.totp_code,
        )
    except OutboundError as e:
        raise HTTPException(
            status_code=e.http_status, detail={"code": e.code, "params": e.params}
        ) from e

    await write_audit(
        db, actor=admin, action="platform.fee_withdraw",
        target_kind="PLATFORM",
        payload={
            "amount": str(result.amount),
            "to_address": result.to_address,
            "tx_hash": result.tx_hash,
            "purpose": result.purpose.value,
        },
        request=request,
    )
    await db.commit()

    return ApiResponse[FeeWithdrawOut].ok(
        FeeWithdrawOut(
            tx_hash=result.tx_hash,
            amount=result.amount,
            to_address=result.to_address,
        )
    )
