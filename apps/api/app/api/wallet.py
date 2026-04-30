"""Wallet endpoints — 用戶收款地址 + 餘額 + 統一活動歷史(deposits + transfers)。"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.api import ApiResponse
from app.schemas.transfer import ActivityItemOut, ActivityListOut
from app.schemas.wallet import BalanceOut, WalletOut
from app.services import tatum
from app.services.history import list_user_activity
from app.services.ledger import get_pending_amount, get_user_balance
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
    """三個視角:
      - `available` (ledger):真正可動用,內部轉帳會即時影響
      - `onchain` (Tatum):derive 地址在鏈上的真實 USDT 餘額,參考用
      - `pending`: 還在 19-block 確認中的入金
    """
    available = await get_user_balance(db, user.id)
    pending = await get_pending_amount(db, user.id)

    onchain: Decimal = Decimal("0")
    if user.tron_address:
        try:
            onchain = await tatum.get_trc20_balance(user.tron_address, settings.usdt_contract)
        except TatumNotConfigured:
            logger.warning("balance_tatum_not_configured", user_id=user.id)
        except TatumError as e:
            logger.warning("balance_tatum_error", user_id=user.id, error=str(e))

    return ApiResponse[BalanceOut].ok(
        BalanceOut(available=available, onchain=onchain, pending=pending)
    )


@router.get("/history", response_model=ApiResponse[ActivityListOut])
async def get_my_history(
    user: CurrentUserDep,
    db: DbDep,
    type: str | None = Query(default=None, pattern="^(all|DEPOSIT|TRANSFER)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ApiResponse[ActivityListOut]:
    """統一活動列表:DEPOSIT + TRANSFER_IN + TRANSFER_OUT,依時間倒序。"""
    items, total = await list_user_activity(
        db,
        user_id=user.id,
        type_filter=type,
        limit=page_size,
        offset=(page - 1) * page_size,
    )
    return ApiResponse[ActivityListOut].ok(
        ActivityListOut(
            items=[
                ActivityItemOut(
                    id=it.id,
                    type=it.type,
                    amount=it.amount,
                    currency=it.currency,
                    status=it.status,
                    note=it.note,
                    counterparty_email=it.counterparty_email,
                    counterparty_display_name=it.counterparty_display_name,
                    tx_hash=it.tx_hash,
                    created_at=it.created_at,
                )
                for it in items
            ],
            total=total,
            page=page,
            page_size=page_size,
        )
    )
