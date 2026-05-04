"""Admin onboarding funnel observability — F-5b-4.

Two endpoints:
  - GET /api/admin/funnel/overview — aggregated counts per stage + drop-off
  - GET /api/admin/funnel/users    — per-user current state + stall time

Both auth-gated to admin only.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import desc, distinct, func, select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.logging import get_logger
from app.models.funnel_event import FunnelEvent
from app.models.user import User
from app.schemas.api import ApiResponse
from app.services import funnel as funnel_service

router = APIRouter(prefix="/api/admin/funnel", tags=["admin-funnel"])
logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# /overview — funnel counts per stage
# ─────────────────────────────────────────────────────────


class FunnelStageOut(BaseModel):
    event_name: str
    label: str
    user_count: int  # distinct users who have hit this stage
    drop_off_pct: float | None  # vs previous stage (None for first)


class FunnelOverviewOut(BaseModel):
    stages: list[FunnelStageOut]
    total_users: int
    last_signup_at: datetime | None


@router.get("/overview", response_model=ApiResponse[FunnelOverviewOut])
async def funnel_overview(
    admin: CurrentAdminDep, db: DbDep
) -> ApiResponse[FunnelOverviewOut]:
    """Aggregate funnel counts. One row per stage in funnel_service.PRIMARY_FUNNEL_STAGES."""
    # Count distinct users per event_name
    counts: dict[str, int] = {}
    for event_name, _label in funnel_service.PRIMARY_FUNNEL_STAGES:
        result = await db.execute(
            select(func.count(distinct(FunnelEvent.user_id))).where(
                FunnelEvent.event_name == event_name
            )
        )
        counts[event_name] = int(result.scalar_one() or 0)

    stages: list[FunnelStageOut] = []
    prev_count: int | None = None
    for event_name, label in funnel_service.PRIMARY_FUNNEL_STAGES:
        n = counts[event_name]
        drop_off: float | None = None
        if prev_count is not None and prev_count > 0:
            drop_off = round((1.0 - n / prev_count) * 100, 1)
        stages.append(
            FunnelStageOut(
                event_name=event_name,
                label=label,
                user_count=n,
                drop_off_pct=drop_off,
            )
        )
        prev_count = n

    # Total users + last signup (independent of funnel events for sanity check)
    total_q = await db.execute(select(func.count(User.id)))
    total = int(total_q.scalar_one() or 0)
    last_signup_q = await db.execute(select(func.max(User.created_at)))
    last_signup = last_signup_q.scalar_one_or_none()

    return ApiResponse[FunnelOverviewOut].ok(
        FunnelOverviewOut(
            stages=stages,
            total_users=total,
            last_signup_at=last_signup,
        )
    )


# ─────────────────────────────────────────────────────────
# /users — per-user state + stall analysis
# ─────────────────────────────────────────────────────────


class FunnelUserOut(BaseModel):
    user_id: int
    email: str
    signup_at: datetime
    last_event_name: str | None
    last_event_at: datetime | None
    stalled_minutes: int | None  # how long since last event (None if never had one)
    earn_tier: str
    has_earn_account: bool
    bitfinex_connected: bool
    telegram_bound: bool
    kyc_status: str | None  # PENDING / APPROVED / REJECTED / null


@router.get("/users", response_model=ApiResponse[list[FunnelUserOut]])
async def funnel_users(
    admin: CurrentAdminDep, db: DbDep
) -> ApiResponse[list[FunnelUserOut]]:
    """Per-user state with last-event stall time, sorted by stall desc.

    Lets Tommy quickly see "who is stuck the longest" — typically the users
    most worth pinging directly.
    """
    from app.models.earn import EarnAccount, EarnBitfinexConnection
    from app.models.kyc import KycSubmission

    # Pull last event per user — one query, distinct on (user_id) ordered by
    # created_at desc.
    last_events_subq = (
        select(
            FunnelEvent.user_id,
            FunnelEvent.event_name,
            FunnelEvent.created_at,
            func.row_number().over(
                partition_by=FunnelEvent.user_id,
                order_by=desc(FunnelEvent.created_at),
            ).label("rn"),
        )
    ).subquery()
    last_events_q = await db.execute(
        select(
            last_events_subq.c.user_id,
            last_events_subq.c.event_name,
            last_events_subq.c.created_at,
        ).where(last_events_subq.c.rn == 1)
    )
    last_event_map: dict[int, tuple[str, datetime]] = {
        row.user_id: (row.event_name, row.created_at) for row in last_events_q.all()
    }

    # Pull users + key state via LEFT JOINs in one go
    users_q = await db.execute(
        select(User, EarnAccount.id, EarnBitfinexConnection.id)
        .outerjoin(EarnAccount, EarnAccount.user_id == User.id)
        .outerjoin(
            EarnBitfinexConnection,
            (EarnBitfinexConnection.earn_account_id == EarnAccount.id)
            & (EarnBitfinexConnection.revoked_at.is_(None)),
        )
        .order_by(User.id)
    )

    # KYC status per user (latest submission only — older ones are dropped)
    latest_kyc_ids = (
        select(func.max(KycSubmission.id))
        .group_by(KycSubmission.user_id)
        .scalar_subquery()
    )
    kyc_q = await db.execute(
        select(KycSubmission.user_id, KycSubmission.status)
        .where(KycSubmission.id.in_(latest_kyc_ids))
    )
    kyc_map: dict[int, str] = {
        row.user_id: row.status for row in kyc_q.all()
    }

    now = datetime.now(timezone.utc)
    out: list[FunnelUserOut] = []
    for user, earn_account_id, conn_id in users_q.all():
        last_event = last_event_map.get(user.id)
        if last_event is not None:
            evt_name, evt_at = last_event
            stalled_minutes = int((now - evt_at).total_seconds() / 60)
        else:
            evt_name, evt_at, stalled_minutes = None, None, None

        out.append(
            FunnelUserOut(
                user_id=user.id,
                email=user.email,
                signup_at=user.created_at,
                last_event_name=evt_name,
                last_event_at=evt_at,
                stalled_minutes=stalled_minutes,
                earn_tier=user.earn_tier,
                has_earn_account=earn_account_id is not None,
                bitfinex_connected=conn_id is not None,
                telegram_bound=user.telegram_chat_id is not None,
                kyc_status=kyc_map.get(user.id),
            )
        )

    # Sort: longest stall first (None goes to end)
    out.sort(
        key=lambda u: (
            u.stalled_minutes is None,
            -(u.stalled_minutes or 0),
        )
    )

    return ApiResponse[list[FunnelUserOut]].ok(out)
