"""Wallet endpoints — 用戶收款地址。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.api import ApiResponse
from app.schemas.wallet import WalletOut
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
