"""Admin dev endpoints。

simulate-deposit 只在 testnet 開放,for development e2e 測試,不在 mainnet 啟用。
sync-tatum 兩邊都可用,讓 admin 在 ngrok URL 變動後手動再來一次同步。
"""

from __future__ import annotations

import secrets
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.wallet import OnchainTxOut
from app.services.ledger import post_deposit
from app.services.onchain import record_provisional_deposit
from app.services.subscription import resolve_callback_url, sync_all_subscriptions

router = APIRouter(prefix="/api/admin/dev", tags=["admin-dev"])
logger = get_logger(__name__)


class SimulateDepositIn(BaseModel):
    user_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0)


def _require_dev_env() -> None:
    if settings.env != "testnet":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "dev.disabledOnMainnet"},
        )


@router.post("/simulate-deposit", response_model=ApiResponse[OnchainTxOut])
async def simulate_deposit(
    payload: SimulateDepositIn,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[OnchainTxOut]:
    _require_dev_env()

    user_q = await db.execute(select(User).where(User.id == payload.user_id))
    target_user = user_q.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "dev.userNotFound"},
        )
    if not target_user.tron_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "dev.userHasNoAddress"},
        )

    fake_tx_hash = secrets.token_hex(32)  # 64 hex chars,模擬 Tron tx hash
    fake_payload = {
        "txId": fake_tx_hash,
        "address": target_user.tron_address,
        "amount": str(payload.amount),
        "asset": "USDT",
        "blockNumber": None,
        "_simulated": True,
        "_simulated_by_admin": admin.id,
    }

    onchain_tx = await record_provisional_deposit(
        db,
        tx_hash=fake_tx_hash,
        to_address=target_user.tron_address,
        amount=payload.amount,
        currency="USDT-TRC20",
        block_number=None,
        raw_payload=fake_payload,
    )
    if onchain_tx is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "dev.simulationFailed"},
        )

    # 假 tx_hash 不存在於鏈上,confirm_onchain_tx 會永遠等不到 — 直接 mock confirm
    onchain_tx.confirmations = 19
    await post_deposit(db, onchain_tx)

    logger.info(
        "dev_deposit_simulated",
        admin_id=admin.id,
        target_user_id=payload.user_id,
        amount=str(payload.amount),
        onchain_tx_id=onchain_tx.id,
    )

    return ApiResponse[OnchainTxOut].ok(OnchainTxOut.model_validate(onchain_tx))


class TatumSyncOut(BaseModel):
    callback_url: str | None
    created: int
    refreshed: int
    skipped: int
    failed: int


@router.post("/sync-tatum", response_model=ApiResponse[TatumSyncOut])
async def sync_tatum(_: CurrentAdminDep, db: DbDep) -> ApiResponse[TatumSyncOut]:
    """重新偵測 ngrok URL → 對所有用戶同步 Tatum 訂閱。

    用途:
    - ngrok 重啟後 URL 變了,點這個按鈕重新訂閱
    - 新增了 user 但 lifespan 同步漏掉
    """
    callback_url = await resolve_callback_url()
    if not callback_url:
        return ApiResponse[TatumSyncOut].ok(
            TatumSyncOut(
                callback_url=None, created=0, refreshed=0, skipped=0, failed=0
            )
        )

    stats = await sync_all_subscriptions(db, callback_url)
    return ApiResponse[TatumSyncOut].ok(
        TatumSyncOut(
            callback_url=callback_url,
            created=stats.created,
            refreshed=stats.refreshed,
            skipped=stats.skipped,
            failed=stats.failed,
        )
    )
