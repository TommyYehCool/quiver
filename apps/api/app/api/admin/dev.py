"""Admin dev endpoints。

- sync-tatum 兩邊都可用,讓 admin 在 ngrok URL 變動後手動再來一次同步
- replay-onchain-tx 兩邊都可用,救回被 filter 擋掉 / webhook 漏接的真鏈交易
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.schemas.api import ApiResponse
from app.schemas.wallet import OnchainTxOut
from app.services.onchain import record_provisional_deposit
from app.services.subscription import resolve_callback_url, sync_all_subscriptions

router = APIRouter(prefix="/api/admin/dev", tags=["admin-dev"])
logger = get_logger(__name__)


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


class ReplayOnchainIn(BaseModel):
    tx_hash: str = Field(min_length=10, max_length=80)
    to_address: str = Field(min_length=34, max_length=34)
    amount: Decimal = Field(gt=0)
    block_number: int | None = None


@router.post("/replay-onchain-tx", response_model=ApiResponse[OnchainTxOut])
async def replay_onchain_tx(
    payload: ReplayOnchainIn,
    admin: CurrentAdminDep,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
) -> ApiResponse[OnchainTxOut]:
    """補錄被 filter 擋掉 / webhook 漏接的真鏈交易。

    流程跟正常 webhook 一樣:插 PROVISIONAL → 排 confirm 任務 → 任務查 block_number 算 confirmations。
    冪等:tx_hash unique,重複呼叫會 409。
    """
    raw_payload = {
        "txId": payload.tx_hash,
        "address": payload.to_address,
        "amount": str(payload.amount),
        "asset": settings.usdt_contract,
        "blockNumber": payload.block_number,
        "_replayed": True,
        "_replayed_by_admin": admin.id,
    }

    onchain_tx = await record_provisional_deposit(
        db,
        tx_hash=payload.tx_hash,
        to_address=payload.to_address,
        amount=payload.amount,
        currency="USDT-TRC20",
        block_number=payload.block_number,
        raw_payload=raw_payload,
    )
    if onchain_tx is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "replay.alreadyRecordedOrInvalid"},
        )

    await arq.enqueue_job(  # type: ignore[attr-defined]
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx.id,
        _defer_by=5,
    )

    logger.info(
        "onchain_tx_replayed",
        admin_id=admin.id,
        tx_hash=payload.tx_hash,
        amount=str(payload.amount),
        onchain_tx_id=onchain_tx.id,
    )
    return ApiResponse[OnchainTxOut].ok(OnchainTxOut.model_validate(onchain_tx))
