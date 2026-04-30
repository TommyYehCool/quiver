"""Admin dev endpoints — 只在 testnet 開放,for development e2e 測試。

不在 mainnet 啟用,避免假資料污染。
"""

from __future__ import annotations

import secrets
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.wallet import OnchainTxOut
from app.services.onchain import record_provisional_deposit

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
    arq: Annotated[object, Depends(get_arq_pool)],
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

    await arq.enqueue_job(  # type: ignore[attr-defined]
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx.id,
        _defer_by=10,  # dev 加速,10 秒後就升 POSTED
    )

    logger.info(
        "dev_deposit_simulated",
        admin_id=admin.id,
        target_user_id=payload.user_id,
        amount=str(payload.amount),
        onchain_tx_id=onchain_tx.id,
    )

    return ApiResponse[OnchainTxOut].ok(OnchainTxOut.model_validate(onchain_tx))
