"""Withdrawal user endpoints — 送出申請 + 看自己的提領紀錄。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.withdrawal import WithdrawalRequest
from app.schemas.api import ApiResponse
from app.schemas.withdrawal import (
    WithdrawalOut,
    WithdrawalQuoteIn,
    WithdrawalQuoteOut,
    WithdrawalSubmitIn,
    WithdrawalSubmitOut,
)
from app.services.withdrawal import WithdrawalError, submit_withdrawal

router = APIRouter(prefix="/api/withdrawals", tags=["withdrawals"])
logger = get_logger(__name__)


@router.post("/quote", response_model=ApiResponse[WithdrawalQuoteOut])
async def quote_withdrawal(
    payload: WithdrawalQuoteIn,
    _: CurrentUserDep,
) -> ApiResponse[WithdrawalQuoteOut]:
    """純試算,不寫 DB。用於 confirm modal 顯示 fee + total + 是否需 admin review。"""
    fee = settings.withdrawal_fee_usdt
    return ApiResponse[WithdrawalQuoteOut].ok(
        WithdrawalQuoteOut(
            amount=payload.amount,
            fee=fee,
            total=payload.amount + fee,
            needs_admin_review=payload.amount >= settings.withdrawal_large_threshold_usd,
        )
    )


@router.post("", response_model=ApiResponse[WithdrawalSubmitOut])
async def post_withdrawal(
    payload: WithdrawalSubmitIn,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[WithdrawalSubmitOut]:
    try:
        result = await submit_withdrawal(
            db,
            user=user,
            to_address=payload.to_address,
            amount=payload.amount,
        )
    except WithdrawalError as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code},
        ) from e

    return ApiResponse[WithdrawalSubmitOut].ok(
        WithdrawalSubmitOut(
            withdrawal_id=result.withdrawal_id,
            status=result.status,
            fee=result.fee,
            needs_admin_review=result.needs_admin_review,
        )
    )


@router.get("/me", response_model=ApiResponse[list[WithdrawalOut]])
async def get_my_withdrawals(
    user: CurrentUserDep,
    db: DbDep,
    limit: int = 20,
) -> ApiResponse[list[WithdrawalOut]]:
    q = await db.execute(
        select(WithdrawalRequest)
        .where(WithdrawalRequest.user_id == user.id)
        .order_by(WithdrawalRequest.id.desc())
        .limit(min(limit, 100))
    )
    rows = q.scalars().all()
    return ApiResponse[list[WithdrawalOut]].ok(
        [WithdrawalOut.model_validate(r) for r in rows]
    )
