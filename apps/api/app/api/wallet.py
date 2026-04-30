"""Wallet endpoints — 用戶收款地址 + 餘額 + 歷史。"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.onchain_tx import OnchainTx
from app.schemas.api import ApiResponse
from app.schemas.wallet import BalanceOut, OnchainTxOut, WalletOut
from app.services import tatum
from app.services.ledger import get_pending_amount
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import WalletError, get_or_derive_tron_address

router = APIRouter(prefix="/api/wallet", tags=["wallet"])
logger = get_logger(__name__)


@router.get("/me", response_model=ApiResponse[WalletOut])
async def get_my_wallet(user: CurrentUserDep, db: DbDep) -> ApiResponse[WalletOut]:
    try:
        address = await get_or_derive_tron_address(db, user)
    except WalletError as e:
        logger.warning("wallet_not_ready", user_id=user.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "wallet.systemNotReady"},
        ) from e

    return ApiResponse[WalletOut].ok(WalletOut(address=address, network=settings.env))


@router.get("/balance", response_model=ApiResponse[BalanceOut])
async def get_my_balance(user: CurrentUserDep, db: DbDep) -> ApiResponse[BalanceOut]:
    """可動用餘額直接從鏈上(Tatum)讀,而非 ledger。

    為什麼:Phase 3 階段先以鏈為準,讓 ledger 維持 audit-only。
    地址不存在 / Tatum 沒設 / API 出錯時 fallback 0。
    pending 還是用我們本地 PROVISIONAL 的 sum(用來顯示「正在處理中」)。
    """
    available: Decimal = Decimal("0")
    if user.tron_address:
        try:
            available = await tatum.get_trc20_balance(user.tron_address, settings.usdt_contract)
        except TatumNotConfigured:
            logger.warning("balance_tatum_not_configured", user_id=user.id)
        except TatumError as e:
            logger.warning("balance_tatum_error", user_id=user.id, error=str(e))

    pending = await get_pending_amount(db, user.id)
    return ApiResponse[BalanceOut].ok(BalanceOut(available=available, pending=pending))


@router.get("/history", response_model=ApiResponse[list[OnchainTxOut]])
async def get_my_deposits(
    user: CurrentUserDep,
    db: DbDep,
    limit: int = 20,
) -> ApiResponse[list[OnchainTxOut]]:
    result = await db.execute(
        select(OnchainTx)
        .where(OnchainTx.user_id == user.id)
        .order_by(OnchainTx.id.desc())
        .limit(min(limit, 100))
    )
    rows = result.scalars().all()
    return ApiResponse[list[OnchainTxOut]].ok([OnchainTxOut.model_validate(r) for r in rows])
