"""Onboarding funnel event tracker — F-5b-4.

Centralized helpers for inserting rows into `funnel_events`. Two flavors:

  - `track(db, user_id, event_name, **props)` — always inserts. Use for
    events that can recur (e.g., login_succeeded each session).
  - `track_once(db, user_id, event_name, **props)` — inserts ONLY if the
    user has never had this event before. Use for stage transitions
    (signup_completed, kyc_form_opened) so multi-clicks don't pollute.

**Caller responsibility**:
  - Pass an active session; we don't open one.
  - Caller's commit (or transaction context) flushes the insert. We do
    `db.flush()` so the row is visible within the same transaction.
  - Failures are logged + swallowed: a funnel-tracking failure must
    NEVER fail the underlying business action (signup, KYC, etc.).

Convention for event_name: snake_case `verb_noun` past-tense.
  signup_completed, kyc_submitted, bitfinex_connect_failed, ...

For known-bad event names, see EVENT_NAMES below — keep it as a single
source of truth so admin queries / UI can iterate.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.funnel_event import FunnelEvent

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# Canonical event name registry
#
# Keep alphabetized within each stage. Add new events here so admin
# tools can list known events without walking the whole DB.
# ─────────────────────────────────────────────────────────

# Stage 1 — auth + onboarding
SIGNUP_COMPLETED = "signup_completed"
TOS_ACCEPTED = "tos_accepted"

# Stage 2 — KYC
KYC_FORM_OPENED = "kyc_form_opened"          # GET /kyc page first time
KYC_SUBMITTED = "kyc_submitted"              # POST /kyc/submissions success
KYC_APPROVED = "kyc_approved"                # admin action
KYC_REJECTED = "kyc_rejected"                # admin action

# Stage 3 — Bitfinex / Earn activation
BOT_SETTINGS_OPENED = "bot_settings_opened"  # first /api/earn/connect-preview
BITFINEX_CONNECT_ATTEMPTED = "bitfinex_connect_attempted"
BITFINEX_CONNECT_FAILED = "bitfinex_connect_failed"
BITFINEX_CONNECT_SUCCEEDED = "bitfinex_connect_succeeded"

# Stage 4 — first money flow
FIRST_DEPOSIT_RECEIVED = "first_deposit_received"
FIRST_LENT_SUCCEEDED = "first_lent_succeeded"

# Stage 5 — engagement (optional)
TELEGRAM_BOUND = "telegram_bound"
LEADERBOARD_OPTIN_ENABLED = "leaderboard_optin_enabled"
STRATEGY_PRESET_CHANGED = "strategy_preset_changed"
AUTO_LEND_DISABLED = "auto_lend_disabled"

# Stage 6 — perf fee / dunning lifecycle (informational)
DUNNING_PAUSED = "dunning_paused"
DUNNING_RESUMED = "dunning_resumed"

# Stage 7 — TG notification idempotency markers (one-shot per user, ever).
# Used with track_once to guarantee we only send these "first time" alerts
# once. If the user resolves and re-encounters the same condition, no
# proactive ping (the dunning_paused / EXPIRED notifications still fire
# at the more-serious thresholds).
TG_NOTIFICATION_PERF_FEE_PENDING_SENT = "tg_notification_perf_fee_pending_sent"
TG_NOTIFICATION_PREMIUM_PAYMENT_FAILED_SENT = (
    "tg_notification_premium_payment_failed_sent"
)


# Convenience grouping for admin overview UI — order matters (drives
# funnel chart sequence).
PRIMARY_FUNNEL_STAGES: list[tuple[str, str]] = [
    (SIGNUP_COMPLETED, "Signup"),
    (TOS_ACCEPTED, "Accepted ToS"),
    (KYC_FORM_OPENED, "Opened KYC"),
    (KYC_SUBMITTED, "Submitted KYC"),
    (KYC_APPROVED, "KYC approved"),
    (BOT_SETTINGS_OPENED, "Opened bot settings"),
    (BITFINEX_CONNECT_ATTEMPTED, "Tried Bitfinex connect"),
    (BITFINEX_CONNECT_SUCCEEDED, "Connected Bitfinex"),
    (FIRST_LENT_SUCCEEDED, "First lent ✨"),
]


# ─────────────────────────────────────────────────────────
# Tracking helpers
# ─────────────────────────────────────────────────────────


async def track(
    db: AsyncSession,
    user_id: int,
    event_name: str,
    properties: dict[str, Any] | None = None,
) -> None:
    """Insert one funnel event row. Always inserts (no dedup).

    Failures are logged + swallowed — never raises into the caller.
    """
    try:
        row = FunnelEvent(
            user_id=user_id,
            event_name=event_name,
            properties=properties,
        )
        db.add(row)
        await db.flush()
        logger.info(
            "funnel_event_tracked",
            user_id=user_id,
            evt_name=event_name,
            has_props=properties is not None,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "funnel_track_failed",
            user_id=user_id,
            evt_name=event_name,
            error=str(e),
        )


async def track_once(
    db: AsyncSession,
    user_id: int,
    event_name: str,
    properties: dict[str, Any] | None = None,
) -> bool:
    """Insert only if the user has never had this event before.

    Returns True if inserted (first occurrence), False if already exists
    or tracking failed.

    Use for stage-transition events that should be idempotent across
    multi-clicks / page refreshes (signup_completed, kyc_form_opened, etc.).
    """
    try:
        existing = await db.execute(
            select(FunnelEvent.id).where(
                FunnelEvent.user_id == user_id,
                FunnelEvent.event_name == event_name,
            ).limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            return False
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "funnel_track_once_existence_check_failed",
            user_id=user_id,
            evt_name=event_name,
            error=str(e),
        )
        return False

    try:
        row = FunnelEvent(
            user_id=user_id,
            event_name=event_name,
            properties=properties,
        )
        db.add(row)
        await db.flush()
        logger.info(
            "funnel_event_tracked",
            user_id=user_id,
            evt_name=event_name,
            once=True,
        )
        return True
    except Exception as e:  # noqa: BLE001
        # Possibly a race (two concurrent first-time inserts). Log + move on.
        logger.warning(
            "funnel_track_once_insert_failed",
            user_id=user_id,
            evt_name=event_name,
            error=str(e),
        )
        return False
