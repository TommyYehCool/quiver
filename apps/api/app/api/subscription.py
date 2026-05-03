"""User-facing Subscription endpoints (F-4c).

- GET  /api/subscription/me        — current state + plan info
- POST /api/subscription/subscribe — debit immediately, start ACTIVE period
- POST /api/subscription/cancel    — schedule cancel at period_end
- POST /api/subscription/uncancel  — undo a pending cancellation
- GET  /api/subscription/payments  — billing history (PAID + FAILED rows)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.models.subscription import Subscription
from app.schemas.api import ApiResponse
from app.schemas.subscription import (
    PaymentOut,
    PaymentsOut,
    SubscribeOut,
    SubscriptionMeOut,
    SubscriptionStateOut,
)
from app.services.premium import billing as sub_billing
from app.services.premium import policy as sub_policy
from app.services.premium import repo as sub_repo

router = APIRouter(prefix="/api/subscription", tags=["subscription"])
logger = get_logger(__name__)


def _to_state(sub: Subscription) -> SubscriptionStateOut:
    return SubscriptionStateOut(
        status=sub.status,
        plan_code=sub.plan_code,
        monthly_usdt=sub.monthly_usdt,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        is_currently_active=sub.is_currently_active,
        past_due_since=sub.past_due_since,
    )


@router.get("/me", response_model=ApiResponse[SubscriptionMeOut])
async def get_subscription_me(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[SubscriptionMeOut]:
    sub = await sub_repo.get_by_user(db, user.id)
    return ApiResponse[SubscriptionMeOut].ok(
        SubscriptionMeOut(
            subscription=_to_state(sub) if sub else None,
            plan_price_usdt=sub_policy.PREMIUM_MONTHLY_PRICE_USDT,
            plan_period_days=sub_policy.PERIOD_DAYS,
            grace_days=sub_policy.PAST_DUE_GRACE_DAYS,
        )
    )


@router.post("/subscribe", response_model=ApiResponse[SubscribeOut])
async def subscribe_premium(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[SubscribeOut]:
    """Charge $9.99 USDT immediately and activate Premium for 30 days. Re-using
    this on an EXPIRED/CANCELLED subscription overwrites the row in place."""
    try:
        sub = await sub_billing.subscribe(db, user_id=user.id)
    except sub_billing.SubscriptionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code},
        ) from e
    await db.commit()
    await db.refresh(sub)
    return ApiResponse[SubscribeOut].ok(SubscribeOut(subscription=_to_state(sub)))


@router.post("/cancel", response_model=ApiResponse[SubscribeOut])
async def cancel_subscription(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[SubscribeOut]:
    """Schedule cancellation at current_period_end. Premium benefits stay until
    then. Reversible via /uncancel before period_end."""
    try:
        sub = await sub_billing.cancel(db, user_id=user.id)
    except sub_billing.SubscriptionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code},
        ) from e
    await db.commit()
    await db.refresh(sub)
    return ApiResponse[SubscribeOut].ok(SubscribeOut(subscription=_to_state(sub)))


@router.post("/uncancel", response_model=ApiResponse[SubscribeOut])
async def uncancel_subscription(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[SubscribeOut]:
    """Undo a pending cancellation. Subscription resumes auto-renewal."""
    try:
        sub = await sub_billing.uncancel(db, user_id=user.id)
    except sub_billing.SubscriptionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code},
        ) from e
    await db.commit()
    await db.refresh(sub)
    return ApiResponse[SubscribeOut].ok(SubscribeOut(subscription=_to_state(sub)))


@router.get("/payments", response_model=ApiResponse[PaymentsOut])
async def list_my_payments(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[PaymentsOut]:
    payments = await sub_repo.list_payments_for_user(db, user.id, limit=100)
    return ApiResponse[PaymentsOut].ok(
        PaymentsOut(
            items=[
                PaymentOut(
                    id=p.id,
                    amount_usdt=p.amount_usdt,
                    status=p.status,
                    failure_reason=p.failure_reason,
                    period_covered_start=p.period_covered_start,
                    period_covered_end=p.period_covered_end,
                    billed_at=p.billed_at,
                )
                for p in payments
            ]
        )
    )
