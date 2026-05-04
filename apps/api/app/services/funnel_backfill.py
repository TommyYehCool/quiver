"""One-time backfill of funnel events from existing DB state — F-5b-4.

Walk users + their kyc_submissions + earn_accounts + earn_positions and
synthesize the funnel events they would have produced if instrumentation
had existed at the time. Idempotent — uses track_once for stage events,
so re-running is a no-op.

Run via:
  docker compose exec api python -c \\
    "import asyncio; from app.services.funnel_backfill import backfill_all; \\
     asyncio.run(backfill_all())"
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.earn import EarnAccount, EarnPosition, EarnPositionStatus
from app.models.kyc import KycStatus, KycSubmission
from app.models.user import User
from app.services import funnel

logger = get_logger(__name__)


async def backfill_one_user(db: AsyncSession, user: User) -> dict[str, int]:
    """Synthesize funnel events for one user. Returns count per event inserted."""
    counts: dict[str, int] = {}

    # signup_completed — created_at exists on every user
    if await funnel.track_once(
        db, user.id, funnel.SIGNUP_COMPLETED, properties={"backfilled": True}
    ):
        counts[funnel.SIGNUP_COMPLETED] = 1

    # tos_accepted
    if user.tos_accepted_at is not None:
        if await funnel.track_once(
            db, user.id, funnel.TOS_ACCEPTED,
            properties={"backfilled": True, "version": user.tos_version},
        ):
            counts[funnel.TOS_ACCEPTED] = 1

    # KYC events — get all submissions, fire approved/rejected based on status.
    # We don't backfill kyc_form_opened (no record of which users visited
    # /kyc page without submitting); they'll get it on next visit.
    kycs = (await db.execute(
        select(KycSubmission).where(KycSubmission.user_id == user.id)
    )).scalars().all()
    for sub in kycs:
        # If submission exists, the user opened the form too
        if await funnel.track_once(
            db, user.id, funnel.KYC_FORM_OPENED, properties={"backfilled": True}
        ):
            counts[funnel.KYC_FORM_OPENED] = 1
        if await funnel.track_once(
            db, user.id, funnel.KYC_SUBMITTED,
            properties={"backfilled": True, "submission_id": sub.id},
        ):
            counts[funnel.KYC_SUBMITTED] = counts.get(funnel.KYC_SUBMITTED, 0) + 1
        if sub.status == KycStatus.APPROVED.value:
            if await funnel.track_once(
                db, user.id, funnel.KYC_APPROVED,
                properties={"backfilled": True, "submission_id": sub.id},
            ):
                counts[funnel.KYC_APPROVED] = 1
        elif sub.status == KycStatus.REJECTED.value:
            if await funnel.track_once(
                db, user.id, funnel.KYC_REJECTED,
                properties={
                    "backfilled": True,
                    "submission_id": sub.id,
                    "reason": (sub.reject_reason or "")[:200],
                },
            ):
                counts[funnel.KYC_REJECTED] = 1

    # bot_settings_opened — no historical record. We can infer it for users
    # who SUCCESSFULLY connected Bitfinex (must have opened the page) but
    # there's no signal for "opened but didn't connect". Fire only for
    # users with an earn_account.
    earn_account = (await db.execute(
        select(EarnAccount).where(EarnAccount.user_id == user.id)
    )).scalar_one_or_none()
    if earn_account is not None:
        if await funnel.track_once(
            db, user.id, funnel.BOT_SETTINGS_OPENED,
            properties={"backfilled": True},
        ):
            counts[funnel.BOT_SETTINGS_OPENED] = 1
        # bitfinex_connect_attempted + succeeded (the existence of the row
        # means connect succeeded — we never persist a failed attempt's row)
        if await funnel.track_once(
            db, user.id, funnel.BITFINEX_CONNECT_ATTEMPTED,
            properties={"backfilled": True},
        ):
            counts[funnel.BITFINEX_CONNECT_ATTEMPTED] = 1
        if await funnel.track_once(
            db, user.id, funnel.BITFINEX_CONNECT_SUCCEEDED,
            properties={
                "backfilled": True,
                "earn_account_id": earn_account.id,
                "tier": user.earn_tier,
            },
        ):
            counts[funnel.BITFINEX_CONNECT_SUCCEEDED] = 1

        # first_lent — earliest LENT-or-beyond position
        first_lent = (await db.execute(
            select(EarnPosition)
            .where(
                EarnPosition.earn_account_id == earn_account.id,
                EarnPosition.status.in_([
                    EarnPositionStatus.LENT.value,
                    EarnPositionStatus.CLOSING.value,
                    EarnPositionStatus.CLOSED_EXTERNAL.value,
                ]),
            )
            .order_by(EarnPosition.id.asc())
            .limit(1)
        )).scalar_one_or_none()
        if first_lent is not None:
            if await funnel.track_once(
                db, user.id, funnel.FIRST_LENT_SUCCEEDED,
                properties={"backfilled": True, "position_id": first_lent.id},
            ):
                counts[funnel.FIRST_LENT_SUCCEEDED] = 1

    # telegram_bound
    if user.telegram_chat_id is not None:
        if await funnel.track_once(
            db, user.id, funnel.TELEGRAM_BOUND,
            properties={"backfilled": True, "username": user.telegram_username},
        ):
            counts[funnel.TELEGRAM_BOUND] = 1

    # leaderboard opt-in
    if user.show_on_leaderboard:
        if await funnel.track_once(
            db, user.id, funnel.LEADERBOARD_OPTIN_ENABLED,
            properties={"backfilled": True},
        ):
            counts[funnel.LEADERBOARD_OPTIN_ENABLED] = 1

    return counts


async def backfill_all() -> dict[str, int]:
    """Run backfill for all users. Returns aggregate count per event."""
    from app.core.db import AsyncSessionLocal

    aggregate: dict[str, int] = {}
    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User))).scalars().all()
        logger.info("funnel_backfill_starting", user_count=len(users))
        for u in users:
            counts = await backfill_one_user(db, u)
            for k, v in counts.items():
                aggregate[k] = aggregate.get(k, 0) + v
        await db.commit()
    logger.info("funnel_backfill_done", inserted=aggregate)
    return aggregate
