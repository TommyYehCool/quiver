"""User-facing Referral endpoints (F-4b).

- GET  /api/referral/me        — my code, my referrer, my invitees, my earnings
- POST /api/referral/code      — set my code (one-time)
- POST /api/referral/bind      — paste a code to bind myself to a referrer
- GET  /api/referral/payouts   — my payout history
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.referral import ReferralBindingSource
from app.schemas.api import ApiResponse
from app.schemas.referral import (
    BindIn,
    BindOut,
    PayoutOut,
    PayoutsOut,
    ReferralMeOut,
    ReferrerInfo,
    SetCodeIn,
    SetCodeOut,
)
from app.services.referral import binding as referral_binding
from app.services.referral import codes as referral_codes
from app.services.referral import policy, repo

router = APIRouter(prefix="/api/referral", tags=["referral"])
logger = get_logger(__name__)


def _bps_to_pct(bps: int) -> Decimal:
    """Convert basis points to whole-percent Decimal. 1000 → 10.00."""
    return Decimal(bps) / Decimal(100)


@router.get("/me", response_model=ApiResponse[ReferralMeOut])
async def get_referral_me(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[ReferralMeOut]:
    code_row = await repo.get_code_by_user(db, user.id)
    referral_row = await repo.get_referral_by_referee(db, user.id)
    direct_count = await repo.count_direct_referees(db, user.id)
    total_earned = await repo.total_earned_for_user(db, user.id)

    referrer_info: ReferrerInfo | None = None
    if referral_row is not None:
        # Look up the referrer's own code so the UI can display
        # "你被 TOMMYYEH 推薦" instead of generic "you have a referrer".
        # Defensive: every binding goes through a code → referrer lookup
        # so the code MUST exist; we still default to "—" if the row is
        # somehow missing (would only happen if an admin nuked the code).
        referrer_code_row = await repo.get_code_by_user(db, referral_row.referrer_user_id)
        referrer_code = referrer_code_row.code if referrer_code_row else "—"
        referrer_info = ReferrerInfo(
            referrer_user_id=referral_row.referrer_user_id,
            referrer_code=referrer_code,
            bound_at=referral_row.bound_at,
            binding_source=referral_row.binding_source,
            revshare_started_at=referral_row.revshare_started_at,
            revshare_expires_at=referral_row.revshare_expires_at,
        )

    return ApiResponse[ReferralMeOut].ok(
        ReferralMeOut(
            code=code_row.code if code_row else None,
            share_url_template=f"{settings.frontend_base_url.rstrip('/')}/?ref={{code}}",
            referrer=referrer_info,
            direct_referees_count=direct_count,
            total_earned_usdt=total_earned,
            l1_pct=_bps_to_pct(policy.L1_REVSHARE_BPS),
            l2_pct=_bps_to_pct(policy.L2_REVSHARE_BPS),
            window_days=policy.REVSHARE_WINDOW_DAYS,
        )
    )


@router.post("/code", response_model=ApiResponse[SetCodeOut])
async def set_my_code(
    payload: SetCodeIn, user: CurrentUserDep, db: DbDep
) -> ApiResponse[SetCodeOut]:
    """One-time set my own referral code. Code is uppercase-normalized,
    4-12 [A-Z0-9]+, must not be reserved or taken.
    """
    try:
        row = await referral_codes.set_code_for_user(
            db, user_id=user.id, raw_code=payload.code
        )
    except referral_codes.CodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code},
        ) from e

    await db.commit()
    return ApiResponse[SetCodeOut].ok(SetCodeOut(code=row.code))


@router.post("/bind", response_model=ApiResponse[BindOut])
async def bind_referrer(
    payload: BindIn, user: CurrentUserDep, db: DbDep
) -> ApiResponse[BindOut]:
    """Paste someone else's code to bind myself as their referee.

    Rules:
      - One binding per user (ever) — already-bound users get
        referral.alreadyBound
      - Cannot self-refer (referral.selfReferral)
      - Cannot create cycles (referral.cycleDetected)
      - Code must exist (referral.codeNotFound)
    """
    try:
        row = await referral_binding.bind(
            db,
            referee_user_id=user.id,
            referrer_code=payload.code,
            source=ReferralBindingSource.SETTINGS_PASTE,
        )
    except referral_binding.BindError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code},
        ) from e

    await db.commit()
    return ApiResponse[BindOut].ok(
        BindOut(
            referrer_user_id=row.referrer_user_id,
            bound_at=row.bound_at,
            binding_source=row.binding_source,
        )
    )


@router.get("/payouts", response_model=ApiResponse[PayoutsOut])
async def list_my_payouts(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[PayoutsOut]:
    payouts = await repo.list_payouts_for_user(db, user.id, limit=100)
    total = await repo.total_earned_for_user(db, user.id)
    return ApiResponse[PayoutsOut].ok(
        PayoutsOut(
            items=[
                PayoutOut(
                    id=p.id,
                    referee_user_id=p.referee_user_id,
                    level=p.level,
                    amount=p.amount,
                    paid_at=p.paid_at,
                )
                for p in payouts
            ],
            total_earned=total,
        )
    )
