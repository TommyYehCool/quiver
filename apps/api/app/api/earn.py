"""User-facing Earn endpoints (F-Phase 3 / Path A self-service).

- GET   /api/earn/me           — user's own earn state (account, positions, snapshot)
- PATCH /api/earn/settings     — toggle auto_lend_enabled
- POST  /api/earn/connect      — submit Bitfinex API key + funding address (gated by KYC)
- GET   /api/earn/performance  — F-5b-1: per-user strategy performance metrics
- GET   /api/earn/public-stats — F-5b-1: aggregate platform stats (no auth)
- GET   /api/earn/fees         — F-5b-2: perf fee accrual + payment status

Admin-only earn management lives in apps/api/app/api/admin/earn.py.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import distinct, func, select

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.models.earn import (
    BitfinexPermissions,
    CustodyMode,
    EarnAccount,
    EarnBitfinexConnection,
    EarnFeeAccrual,
    EarnPosition,
    EarnPositionSnapshot,
    EarnPositionStatus,
    EarnTier,
    FeeAccrualStatus,
)
from app.models.kyc import KycStatus, KycSubmission
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.earn_user import (
    ActiveCreditOut,
    DailyEarning,
    EarnConnectIn,
    EarnConnectOut,
    EarnConnectPreviewOut,
    EarnFeeSummaryOut,
    EarnMeOut,
    EarnPerformanceOut,
    EarnPositionUserOut,
    EarnPublicStatsOut,
    EarnRankOut,
    EarnSettingsOut,
    EarnSettingsUpdateIn,
    EarnSnapshotUserOut,
    FeeAccrualRow,
    RankEntryOut,
)
from app.services import ledger as ledger_service
from app.models.referral import ReferralBindingSource
from app.services.earn import encryption as earn_crypto
from app.services.earn import fee_policy
from app.services.earn import repo as earn_repo
from app.services.earn.bitfinex_adapter import (
    BitfinexFundingAdapter,
    fetch_market_frr,
)
from app.services import telegram as telegram_service
from app.services.referral import binding as referral_binding
from app.services.premium import repo as sub_repo

# F-5b-1: spike threshold mirrors spike_detector.SPIKE_THRESHOLD_APY (12% APY).
# Active credits at or above this rate count as "spike capture" in the
# performance dashboard — the headline number that proves the laddered offers
# (F-5a-3.3) actually catch market spikes.
SPIKE_APR_THRESHOLD = Decimal("12")

router = APIRouter(prefix="/api/earn", tags=["earn-user"])
logger = get_logger(__name__)


async def _get_kyc_status(db, user_id: int) -> str:
    """Return latest KYC submission status, or 'NONE' if user never submitted."""
    q = await db.execute(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.id.desc())
        .limit(1)
    )
    sub = q.scalar_one_or_none()
    return sub.status if sub else "NONE"


async def _list_active_positions(db, earn_account_id: int) -> list[EarnPosition]:
    active_states = (
        EarnPositionStatus.PENDING_OUTBOUND.value,
        EarnPositionStatus.ONCHAIN_IN_FLIGHT.value,
        EarnPositionStatus.FUNDING_IDLE.value,
        EarnPositionStatus.LENT.value,
        EarnPositionStatus.CLOSING.value,
    )
    q = await db.execute(
        select(EarnPosition)
        .where(
            EarnPosition.earn_account_id == earn_account_id,
            EarnPosition.status.in_(active_states),
        )
        .order_by(EarnPosition.created_at.desc())
    )
    return list(q.scalars().all())


@router.get("/me", response_model=ApiResponse[EarnMeOut])
async def get_earn_me(user: CurrentUserDep, db: DbDep) -> ApiResponse[EarnMeOut]:
    """User dashboard data."""
    kyc_status = await _get_kyc_status(db, user.id)
    can_connect = kyc_status == KycStatus.APPROVED.value

    account = await earn_repo.get_account_by_user_id(db, user.id)
    is_premium = await sub_repo.is_user_premium(db, user.id)

    if account is None:
        return ApiResponse[EarnMeOut].ok(
            EarnMeOut(
                kyc_status=kyc_status,
                can_connect=can_connect,
                has_earn_account=False,
                auto_lend_enabled=False,
                strategy_preset=None,
                dunning_pause_active=False,
                telegram_bound=user.telegram_chat_id is not None,
                telegram_bot_username=telegram_service.get_bot_username(),
                telegram_username=user.telegram_username,
                show_on_leaderboard=user.show_on_leaderboard,
                bitfinex_connected=False,
                bitfinex_funding_address=None,
                earn_tier=None,
                perf_fee_bps=None,
                is_premium=is_premium,
                funding_idle_usdt=None,
                lent_usdt=None,
                daily_earned_usdt=None,
                total_at_bitfinex=None,
                active_positions=[],
                active_credits=[],
                recent_snapshots=[],
            )
        )

    conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    snapshots = await earn_repo.list_recent_snapshots(db, account.id, days=30)
    latest = snapshots[-1] if snapshots else None
    active_positions = await _list_active_positions(db, account.id)

    # Live fetch active credits from Bitfinex (so /earn shows real-time loan
    # rate + expiry instead of stale daily snapshot). Costs ~500ms per request
    # but worth it for transparency. Fail open — if Bitfinex hiccups we still
    # render the page with snapshot data.
    active_credits: list[ActiveCreditOut] = []
    funding_idle: Decimal | None = latest.bitfinex_funding_usdt if latest else None
    lent: Decimal | None = latest.bitfinex_lent_usdt if latest else None
    daily_earned: Decimal | None = latest.bitfinex_daily_earned if latest else None
    if conn is not None:
        try:
            from app.services.earn.bitfinex_adapter import BitfinexFundingAdapter

            adapter = await BitfinexFundingAdapter.from_connection(db, conn)
            live_position = await adapter.get_funding_position()
            funding_idle = live_position.funding_available
            lent = live_position.lent_total
            daily_earned = live_position.daily_earned_estimate
            active_credits = [
                ActiveCreditOut(
                    id=c.id,
                    amount=c.amount,
                    rate_daily=c.rate_daily,
                    apr_pct=c.apr_pct,
                    period_days=c.period_days,
                    opened_at_ms=c.opened_at_ms,
                    expires_at_ms=c.expires_at_ms,
                    expected_interest_at_expiry=c.expected_interest_at_expiry,
                )
                for c in live_position.active_credits
            ]
        except Exception as e:  # noqa: BLE001
            logger.warning("earn_me_live_fetch_failed", user_id=user.id, error=str(e))

    total = (
        (funding_idle or Decimal(0)) + (lent or Decimal(0))
        if (funding_idle is not None or lent is not None)
        else None
    )

    return ApiResponse[EarnMeOut].ok(
        EarnMeOut(
            kyc_status=kyc_status,
            can_connect=can_connect,
            has_earn_account=True,
            auto_lend_enabled=account.auto_lend_enabled,
            strategy_preset=account.strategy_preset,
            dunning_pause_active=account.dunning_pause_active,
            telegram_bound=user.telegram_chat_id is not None,
            telegram_bot_username=telegram_service.get_bot_username(),
            telegram_username=user.telegram_username,
            show_on_leaderboard=user.show_on_leaderboard,
            bitfinex_connected=conn is not None,
            bitfinex_funding_address=account.bitfinex_funding_address,
            earn_tier=user.earn_tier,
            perf_fee_bps=account.perf_fee_bps,
            is_premium=is_premium,
            funding_idle_usdt=funding_idle,
            lent_usdt=lent,
            daily_earned_usdt=daily_earned,
            total_at_bitfinex=total,
            active_positions=[
                EarnPositionUserOut(
                    id=p.id,
                    status=p.status,
                    amount=p.amount,
                    onchain_tx_hash=p.onchain_tx_hash,
                    onchain_broadcast_at=p.onchain_broadcast_at,
                    bitfinex_credited_at=p.bitfinex_credited_at,
                    bitfinex_offer_id=p.bitfinex_offer_id,
                    bitfinex_offer_submitted_at=p.bitfinex_offer_submitted_at,
                    closed_at=p.closed_at,
                    last_error=p.last_error,
                )
                for p in active_positions
            ],
            active_credits=active_credits,
            recent_snapshots=[
                EarnSnapshotUserOut(
                    snapshot_date=s.snapshot_date,
                    bitfinex_funding_usdt=s.bitfinex_funding_usdt,
                    bitfinex_lent_usdt=s.bitfinex_lent_usdt,
                    bitfinex_daily_earned=s.bitfinex_daily_earned,
                )
                for s in snapshots
            ],
        )
    )


@router.patch("/settings", response_model=ApiResponse[EarnSettingsOut])
async def update_earn_settings(
    payload: EarnSettingsUpdateIn,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[EarnSettingsOut]:
    """Toggle auto_lend_enabled. Off doesn't affect already-lent positions
    (they roll off naturally on offer expiry); only stops new deposits from
    being auto-broadcast to Bitfinex.
    """
    account = await earn_repo.get_account_by_user_id(db, user.id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "earn.notSetup"},
        )
    changed = False
    if payload.auto_lend_enabled is not None:
        account.auto_lend_enabled = payload.auto_lend_enabled
        changed = True
        logger.info(
            "earn_auto_lend_toggled",
            user_id=user.id,
            earn_account_id=account.id,
            new_value=payload.auto_lend_enabled,
        )
    if payload.strategy_preset is not None:
        prev = account.strategy_preset
        account.strategy_preset = payload.strategy_preset
        changed = True
        logger.info(
            "earn_strategy_preset_changed",
            user_id=user.id,
            earn_account_id=account.id,
            old=prev,
            new=payload.strategy_preset,
        )
        # F-5b-4 funnel — only track when preset actually changes (not no-op
        # PATCH to same value)
        if prev != payload.strategy_preset:
            from app.services import funnel
            await funnel.track(
                db, user.id, funnel.STRATEGY_PRESET_CHANGED,
                properties={"old": prev, "new": payload.strategy_preset},
            )
    # F-5a-4.3 leaderboard opt-in lives on User, not EarnAccount, but it's
    # exposed via this endpoint because the UI toggle is co-located on
    # /earn/bot-settings. Re-fetch the user row attached to this session
    # since `user` from the dep may be from a different session scope.
    if payload.show_on_leaderboard is not None:
        u_row = (
            await db.execute(select(User).where(User.id == user.id))
        ).scalar_one()
        prev = u_row.show_on_leaderboard
        u_row.show_on_leaderboard = payload.show_on_leaderboard
        changed = True
        logger.info(
            "earn_leaderboard_optin_changed",
            user_id=user.id,
            old=prev,
            new=payload.show_on_leaderboard,
        )
        # F-5b-4 funnel — only the FIRST opt-in is interesting (track_once)
        if payload.show_on_leaderboard and not prev:
            from app.services import funnel
            await funnel.track_once(
                db, user.id, funnel.LEADERBOARD_OPTIN_ENABLED,
            )
    if changed:
        await db.commit()
        # Re-resolve user.show_on_leaderboard for the response (we may have
        # changed it; user object from dep is still the cached one)
        leaderboard_state = (
            await db.execute(
                select(User.show_on_leaderboard).where(User.id == user.id)
            )
        ).scalar_one()
    else:
        leaderboard_state = user.show_on_leaderboard
    return ApiResponse[EarnSettingsOut].ok(
        EarnSettingsOut(
            auto_lend_enabled=account.auto_lend_enabled,
            strategy_preset=account.strategy_preset,
            show_on_leaderboard=leaderboard_state,
        )
    )


@router.post("/connect", response_model=ApiResponse[EarnConnectOut])
async def connect_bitfinex(
    payload: EarnConnectIn,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[EarnConnectOut]:
    """Self-service onboarding: KYC-approved users submit their Bitfinex API
    key + funding wallet TRC20 deposit address.

    Steps:
      1. Gate: KYC must be APPROVED
      2. Encrypt + persist API key/secret (AES-GCM via earn_crypto)
      3. Verify the key actually works (call get_funding_position)
      4. Create/update earn_account; cache funding address; mark user.earn_tier='friend'
      5. Return funding balance as confirmation
    """
    # F-5b-4: track every connect ATTEMPT (whether or not KYC gate passes).
    # Funnel needs to see "user tried" so we can distinguish "didn't try" vs
    # "tried but failed at step X". Commit immediately so even if the request
    # raises later, the attempt is recorded.
    from app.services import funnel
    await funnel.track(db, user.id, funnel.BITFINEX_CONNECT_ATTEMPTED)
    await db.commit()

    # Step 1: KYC gate
    kyc_status = await _get_kyc_status(db, user.id)
    if kyc_status != KycStatus.APPROVED.value:
        await funnel.track(
            db, user.id, funnel.BITFINEX_CONNECT_FAILED,
            properties={"reason": "earn.kycRequired", "kyc_status": kyc_status},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "earn.kycRequired", "params": {"current": kyc_status}},
        )

    # Step 2: encrypt
    try:
        cipher_key, key_ver = await earn_crypto.encrypt_bitfinex_key(
            db, plaintext=payload.bitfinex_api_key
        )
        cipher_secret, _ = await earn_crypto.encrypt_bitfinex_key(
            db, plaintext=payload.bitfinex_api_secret
        )
    except Exception as e:
        logger.error("earn_connect_encrypt_failed", user_id=user.id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "earn.encryptFailed"},
        ) from e

    # Step 3: verify by calling Bitfinex with the (in-memory) plaintext key —
    # we test BEFORE persisting so a bad key returns clean error to user.
    test_adapter = BitfinexFundingAdapter(
        api_key=payload.bitfinex_api_key, api_secret=payload.bitfinex_api_secret
    )
    try:
        position = await test_adapter.get_funding_position()
    except Exception as e:
        logger.warning("earn_connect_verify_failed", user_id=user.id, error=str(e))
        # F-5b-4 funnel — verify failed (most common: API key permissions
        # not set right, key revoked, IP allowlist mismatch). Capture for
        # admin to spot patterns ("everyone fails on permission X").
        await funnel.track(
            db, user.id, funnel.BITFINEX_CONNECT_FAILED,
            properties={
                "reason": "earn.bitfinexVerifyFailed",
                "error": str(e)[:200],
            },
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "earn.bitfinexVerifyFailed",
                "params": {"error": str(e)[:200]},
            },
        ) from e

    # Step 4: persist
    account = await earn_repo.get_account_by_user_id(db, user.id)
    if account is None:
        # Fresh user — assign tier based on remaining friend slots (F-4a).
        # First FRIEND_CAP self-service connectors get the friend slot at 5%;
        # everyone else lands on the public tier at 15%.
        assigned_tier = await fee_policy.assign_tier_for_new_connect(db)
        assigned_fee_bps = fee_policy.default_fee_bps_for_tier(assigned_tier)
        account = await earn_repo.create_earn_account(
            db,
            user_id=user.id,
            custody_mode=CustodyMode.SELF.value,
            perf_fee_bps=assigned_fee_bps,
            can_quiver_operate=True,  # self-service implies user wants Quiver to operate
            onboarded_by=user.id,  # self-onboarding
            notes=None,
        )
        # Promote user.earn_tier to match the assigned slot. Internal/admin
        # accounts that already have a tier set keep theirs.
        if user.earn_tier == EarnTier.NONE.value:
            user.earn_tier = assigned_tier
    account.bitfinex_funding_address = payload.bitfinex_funding_address

    # Bitfinex connection: revoke any existing active conn, then add new one
    existing_conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    if existing_conn is not None:
        existing_conn.revoked_at = datetime.now(timezone.utc)

    await earn_repo.add_bitfinex_connection(
        db,
        earn_account_id=account.id,
        is_platform_key=False,
        encrypted_api_key=cipher_key,
        encrypted_api_secret=cipher_secret,
        key_version=key_ver,
        permissions=BitfinexPermissions.READ_FUNDING_WRITE.value,
    )

    # Step 5 (F-4b): optional referral code bind. Failures are soft —
    # connect itself never fails on a bad code, just surfaces the error.
    referral_bind_status: str | None = None
    if payload.referral_code:
        try:
            await referral_binding.bind(
                db,
                referee_user_id=user.id,
                referrer_code=payload.referral_code,
                source=ReferralBindingSource.EARN_CONNECT,
            )
            referral_bind_status = "ok"
        except referral_binding.BindError as e:
            logger.info(
                "earn_connect_referral_bind_failed",
                user_id=user.id,
                code=payload.referral_code,
                reason=e.code,
            )
            referral_bind_status = e.code

    # F-5b-4 funnel — connect succeeded. Includes assigned tier so we can
    # see how many made it past the gate (vs. how many tried but failed).
    await funnel.track(
        db, user.id, funnel.BITFINEX_CONNECT_SUCCEEDED,
        properties={
            "earn_account_id": account.id,
            "tier": user.earn_tier,
            "funding_balance": str(position.funding_balance),
        },
    )

    await db.commit()

    logger.info(
        "earn_user_connected",
        user_id=user.id,
        earn_account_id=account.id,
        funding_balance=str(position.funding_balance),
        lent_total=str(position.lent_total),
    )

    return ApiResponse[EarnConnectOut].ok(
        EarnConnectOut(
            earn_account_id=account.id,
            bitfinex_funding_address=account.bitfinex_funding_address,
            auto_lend_enabled=account.auto_lend_enabled,
            bitfinex_funding_balance=position.funding_balance,
            earn_tier=user.earn_tier,
            perf_fee_bps=account.perf_fee_bps,
            referral_bind_status=referral_bind_status,
        )
    )


@router.get(
    "/connect-preview", response_model=ApiResponse[EarnConnectPreviewOut]
)
async def connect_preview(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[EarnConnectPreviewOut]:
    """Preview the tier + fee a user would receive if they connect right now.

    Drives the fee disclosure UI on /earn/connect — the user sees "you will be
    in the friend tier (5% fee)" or "all 10 friend slots are taken; you'll be
    in the public tier (15% fee)" before they paste their Bitfinex API key.

    If the user already has an earn_account, this echoes their current tier +
    fee instead of pre-assigning a new one.
    """
    # F-5b-4: this endpoint is only fetched from /earn/bot-settings page
    # render → use it as a proxy for "user opened bot-settings". Critical
    # for diagnosing the most common funnel stall ("KYC approved but didn't
    # connect Bitfinex" — was it because they didn't even open the page?).
    from app.services import funnel
    inserted = await funnel.track_once(db, user.id, funnel.BOT_SETTINGS_OPENED)
    if inserted:
        await db.commit()

    friend_count = await fee_policy.count_friend_accounts(db)
    slots_remaining = max(0, fee_policy.FRIEND_CAP - friend_count)

    account = await earn_repo.get_account_by_user_id(db, user.id)
    if account is not None:
        # Already connected — show their current rate, not the would-be rate.
        return ApiResponse[EarnConnectPreviewOut].ok(
            EarnConnectPreviewOut(
                already_connected=True,
                tier=user.earn_tier,
                perf_fee_bps=account.perf_fee_bps,
                perf_fee_pct=fee_policy.bps_to_pct(account.perf_fee_bps),
                friend_slots_total=fee_policy.FRIEND_CAP,
                friend_slots_remaining=slots_remaining,
            )
        )

    # Fresh user — what would they get?
    assigned_tier = await fee_policy.assign_tier_for_new_connect(db)
    assigned_fee_bps = fee_policy.default_fee_bps_for_tier(assigned_tier)
    return ApiResponse[EarnConnectPreviewOut].ok(
        EarnConnectPreviewOut(
            already_connected=False,
            tier=assigned_tier,
            perf_fee_bps=assigned_fee_bps,
            perf_fee_pct=fee_policy.bps_to_pct(assigned_fee_bps),
            friend_slots_total=fee_policy.FRIEND_CAP,
            friend_slots_remaining=slots_remaining,
        )
    )


# ─────────────────────────────────────────────────────────
# F-5b-1 — Performance dashboard (per user) + public stats
# ─────────────────────────────────────────────────────────


def _empty_performance() -> EarnPerformanceOut:
    return EarnPerformanceOut(
        current_frr_apr_pct=None,
        weighted_avg_apr_pct=None,
        apr_vs_frr_delta_pct=None,
        total_interest_30d_usdt=None,
        days_with_data=0,
        daily_earnings=[],
        spike_credits_count=0,
        spike_credits_total_usdt=Decimal("0"),
        best_active_apr_pct=None,
        active_credits_count=0,
        ladder_total_usdt=None,
    )


@router.get("/performance", response_model=ApiResponse[EarnPerformanceOut])
async def get_earn_performance(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[EarnPerformanceOut]:
    """Per-user strategy performance metrics.

    Three data sources:
      - Bitfinex live `active_credits` → weighted APR, spike capture, best APR
      - Bitfinex live ticker FRR       → market baseline for comparison
      - DB snapshots (last 30d)        → daily earnings sparkline + total interest

    Failures degrade gracefully — Bitfinex hiccup → live fields null but
    snapshot-derived stats still render. New user with no snapshot yet →
    everything zero/null but the page still works.
    """
    account = await earn_repo.get_account_by_user_id(db, user.id)
    if account is None or account.archived_at is not None:
        return ApiResponse[EarnPerformanceOut].ok(_empty_performance())

    # ── live: market FRR ──
    market = None
    try:
        market = await fetch_market_frr()
    except Exception as e:  # noqa: BLE001
        logger.warning("earn_performance_frr_fetch_failed", error=str(e))
    current_frr_apr = market.frr_apy_pct if market is not None else None

    # ── live: user's active credits ──
    active_credits: list = []
    conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    if conn is not None:
        try:
            adapter = await BitfinexFundingAdapter.from_connection(db, conn)
            position = await adapter.get_funding_position()
            active_credits = list(position.active_credits)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "earn_performance_bf_query_failed",
                user_id=user.id,
                error=str(e),
            )

    # weighted avg APR across active credits (weight = principal amount)
    weighted_avg = None
    best_apr = None
    if active_credits:
        total_amount = sum((c.amount for c in active_credits), Decimal(0))
        if total_amount > 0:
            weighted_avg = sum(
                (c.apr_pct * c.amount for c in active_credits), Decimal(0)
            ) / total_amount
        best_apr = max((c.apr_pct for c in active_credits), default=None)

    apr_delta = (
        weighted_avg - current_frr_apr
        if weighted_avg is not None and current_frr_apr is not None
        else None
    )

    spike_credits = [c for c in active_credits if c.apr_pct >= SPIKE_APR_THRESHOLD]
    spike_total = sum((c.amount for c in spike_credits), Decimal(0))
    ladder_total = sum((c.amount for c in active_credits), Decimal(0)) if active_credits else None

    # ── snapshots: daily earnings sparkline + total interest ──
    snapshots = await earn_repo.list_recent_snapshots(db, account.id, days=30)
    daily_rows = [
        DailyEarning(date=s.snapshot_date, usdt=s.bitfinex_daily_earned)
        for s in snapshots
        if s.bitfinex_daily_earned is not None
    ]
    total_30d = sum((d.usdt for d in daily_rows), Decimal(0)) if daily_rows else None

    return ApiResponse[EarnPerformanceOut].ok(
        EarnPerformanceOut(
            current_frr_apr_pct=current_frr_apr,
            weighted_avg_apr_pct=weighted_avg,
            apr_vs_frr_delta_pct=apr_delta,
            total_interest_30d_usdt=total_30d,
            days_with_data=len(daily_rows),
            daily_earnings=daily_rows,
            spike_credits_count=len(spike_credits),
            spike_credits_total_usdt=spike_total,
            best_active_apr_pct=best_apr,
            active_credits_count=len(active_credits),
            ladder_total_usdt=ladder_total,
        )
    )


# Process-local cache for /api/earn/public-stats. Reset when api restarts.
# Don't use Redis — this is hot-path no-auth, the in-memory cache is enough
# to absorb scraper traffic without crossing the network for every request.
_PUBLIC_STATS_CACHE_TTL_SEC = 60.0
_public_stats_cache: tuple[float, EarnPublicStatsOut] | None = None


@router.get("/public-stats", response_model=ApiResponse[EarnPublicStatsOut])
async def get_earn_public_stats(db: DbDep) -> ApiResponse[EarnPublicStatsOut]:
    """Aggregate platform stats — no auth required, cached server-side ~60s.

    Three numbers for marketing / social proof:
      - active_bots_count: distinct earn_accounts whose most-recent snapshot
        within the last 7d still shows lent_usdt > 0. Uses snapshot data (not
        earn_positions.status) because the position state machine can lag
        reality — e.g. a row marked closed_external when Bitfinex still has
        funds lent. Snapshots reflect what Bitfinex actually reports.
      - total_lent_usdt:   sum of bitfinex_lent_usdt from each account's
        most recent snapshot (within last 7d to exclude stale rows).
      - avg_apr_30d_pct:   weighted across all snapshots in last 30d using
        daily_earned ÷ lent_usdt → daily rate → annualised. Captures real
        platform-wide performance, not just current top tranche.

    Safe to expose unauthenticated — only counts and totals, no per-user data.
    """
    global _public_stats_cache
    now = time.time()
    if (
        _public_stats_cache is not None
        and now - _public_stats_cache[0] < _PUBLIC_STATS_CACHE_TTL_SEC
    ):
        return ApiResponse[EarnPublicStatsOut].ok(_public_stats_cache[1])

    # Active bots + total lent: both derived from each account's LATEST
    # snapshot within the 7-day staleness budget. Naive aggregation across
    # all rows in the window double-counts when an account has snapshots
    # from multiple days. We use a correlated subquery to pull just each
    # account's most recent row.
    cutoff_recent = date.today() - timedelta(days=7)
    latest_per_account = (
        select(
            EarnPositionSnapshot.earn_account_id,
            func.max(EarnPositionSnapshot.snapshot_date).label("max_date"),
        )
        .where(EarnPositionSnapshot.snapshot_date >= cutoff_recent)
        .group_by(EarnPositionSnapshot.earn_account_id)
        .subquery()
    )

    # Active bots: count accounts whose latest snapshot still has funds lent.
    # We do NOT join to earn_positions.status — that table's state machine
    # can lag reality (e.g. a position marked closed_external while Bitfinex
    # still actively lends the funds). Snapshot is the source of truth.
    bots_q = await db.execute(
        select(
            func.count(distinct(EarnPositionSnapshot.earn_account_id))
        )
        .join(
            latest_per_account,
            (EarnPositionSnapshot.earn_account_id == latest_per_account.c.earn_account_id)
            & (EarnPositionSnapshot.snapshot_date == latest_per_account.c.max_date),
        )
        .where(EarnPositionSnapshot.bitfinex_lent_usdt > 0)
    )
    active_bots_count = int(bots_q.scalar_one() or 0)

    lent_q = await db.execute(
        select(func.coalesce(func.sum(EarnPositionSnapshot.bitfinex_lent_usdt), 0))
        .join(
            latest_per_account,
            (EarnPositionSnapshot.earn_account_id == latest_per_account.c.earn_account_id)
            & (EarnPositionSnapshot.snapshot_date == latest_per_account.c.max_date),
        )
    )
    total_lent = Decimal(str(lent_q.scalar_one() or 0))

    # Platform-weighted 30-day APR:
    #   sum(daily_earned) / sum(lent_usdt over the same days) × 365 × 100
    # Uses snapshot rows where both are non-null and lent > 0.
    cutoff = date.today() - timedelta(days=30)
    apr_q = await db.execute(
        select(
            func.coalesce(func.sum(EarnPositionSnapshot.bitfinex_daily_earned), 0),
            func.coalesce(func.sum(EarnPositionSnapshot.bitfinex_lent_usdt), 0),
        ).where(
            EarnPositionSnapshot.snapshot_date >= cutoff,
            EarnPositionSnapshot.bitfinex_daily_earned.isnot(None),
            EarnPositionSnapshot.bitfinex_lent_usdt.isnot(None),
            EarnPositionSnapshot.bitfinex_lent_usdt > 0,
        )
    )
    earned_sum, lent_sum = apr_q.one()
    earned_sum = Decimal(str(earned_sum or 0))
    lent_sum = Decimal(str(lent_sum or 0))
    avg_apr = None
    if lent_sum > 0:
        # Each row = one day, so sum_lent represents lent-days. The ratio
        # gives the weighted-by-(amount × days) daily rate.
        daily_rate = earned_sum / lent_sum
        avg_apr = (daily_rate * Decimal(365) * Decimal(100)).quantize(Decimal("0.01"))

    result = EarnPublicStatsOut(
        active_bots_count=active_bots_count,
        total_lent_usdt=total_lent.quantize(Decimal("0.01")),
        avg_apr_30d_pct=avg_apr,
    )
    _public_stats_cache = (now, result)
    return ApiResponse[EarnPublicStatsOut].ok(result)


def _next_monday_utc(now: datetime) -> datetime:
    """Next Monday 02:00 UTC — matches services/earn/perf_fee.py cron schedule.

    If today is Monday and current time < 02:00 UTC, returns today 02:00.
    Otherwise the upcoming Monday.
    """
    target_hour = 2
    # weekday(): Mon=0, Sun=6
    days_ahead = (0 - now.weekday()) % 7
    candidate = (now + timedelta(days=days_ahead)).replace(
        hour=target_hour, minute=0, second=0, microsecond=0
    )
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate


@router.get("/fees", response_model=ApiResponse[EarnFeeSummaryOut])
async def get_earn_fees(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[EarnFeeSummaryOut]:
    """Per-user perf fee status — what's accrued, what's been paid, buffer warning.

    Honest about the structural Path A constraint: fees are deducted from the
    user's Quiver wallet (not from Bitfinex), so users with $0 Quiver balance
    accumulate ACCRUED rows that never settle. The `has_buffer_warning` flag
    is the trigger for the UI to nudge users to top up.

    Returns even for fee-exempt users (perf_fee_bps=0 / Premium): they get
    zeros across the board and the client can render an "exempt" badge.
    """
    is_premium = await sub_repo.is_user_premium(db, user.id)

    account = await earn_repo.get_account_by_user_id(db, user.id)
    now = datetime.now(timezone.utc)
    next_settle = _next_monday_utc(now)

    if account is None:
        # No earn account yet → nothing to bill.
        return ApiResponse[EarnFeeSummaryOut].ok(
            EarnFeeSummaryOut(
                perf_fee_bps=0,
                is_premium=is_premium,
                pending_accrued_usdt=Decimal("0"),
                pending_count=0,
                quiver_wallet_balance_usdt=Decimal("0"),
                has_buffer_warning=False,
                dunning_level="ok",
                dunning_pause_active=False,
                paid_30d_usdt=Decimal("0"),
                paid_lifetime_usdt=Decimal("0"),
                last_paid_at=None,
                next_settle_at=next_settle,
                recent_accruals=[],
            )
        )

    # Pending = sum + count of ACCRUED rows
    pending_q = await db.execute(
        select(
            func.coalesce(func.sum(EarnFeeAccrual.fee_amount), 0),
            func.count(EarnFeeAccrual.id),
        ).where(
            EarnFeeAccrual.earn_account_id == account.id,
            EarnFeeAccrual.status == FeeAccrualStatus.ACCRUED.value,
        )
    )
    pending_sum_raw, pending_count = pending_q.one()
    pending_sum = Decimal(str(pending_sum_raw or 0))

    # Paid in last 30d (by paid_at, not period_end)
    cutoff_30d = now - timedelta(days=30)
    paid_30d_q = await db.execute(
        select(func.coalesce(func.sum(EarnFeeAccrual.fee_amount), 0)).where(
            EarnFeeAccrual.earn_account_id == account.id,
            EarnFeeAccrual.status == FeeAccrualStatus.PAID.value,
            EarnFeeAccrual.paid_at >= cutoff_30d,
        )
    )
    paid_30d = Decimal(str(paid_30d_q.scalar_one() or 0))

    # Paid lifetime
    paid_total_q = await db.execute(
        select(func.coalesce(func.sum(EarnFeeAccrual.fee_amount), 0)).where(
            EarnFeeAccrual.earn_account_id == account.id,
            EarnFeeAccrual.status == FeeAccrualStatus.PAID.value,
        )
    )
    paid_lifetime = Decimal(str(paid_total_q.scalar_one() or 0))

    # Last paid_at
    last_paid_q = await db.execute(
        select(EarnFeeAccrual.paid_at)
        .where(
            EarnFeeAccrual.earn_account_id == account.id,
            EarnFeeAccrual.status == FeeAccrualStatus.PAID.value,
            EarnFeeAccrual.paid_at.isnot(None),
        )
        .order_by(EarnFeeAccrual.paid_at.desc())
        .limit(1)
    )
    last_paid_at = last_paid_q.scalar_one_or_none()

    # User's spendable Quiver wallet (= ledger balance, since perf_fee.settle
    # checks the same thing). Premium users still get the number for transparency
    # but it doesn't trigger the buffer warning.
    wallet_balance = await ledger_service.get_user_balance(db, user.id)

    # Buffer warning: pending exceeds wallet (and user isn't premium-exempt)
    has_warning = (
        not is_premium
        and account.perf_fee_bps > 0
        and pending_sum > wallet_balance
        and pending_count > 0
    )

    # Recent accruals (last 12 — covers ~3 months of weekly accruals)
    recent_q = await db.execute(
        select(EarnFeeAccrual)
        .where(EarnFeeAccrual.earn_account_id == account.id)
        .order_by(EarnFeeAccrual.id.desc())
        .limit(12)
    )
    recent = [
        FeeAccrualRow(
            id=row.id,
            period_start=row.period_start,
            period_end=row.period_end,
            earnings_amount=row.earnings_amount,
            fee_bps_applied=row.fee_bps_applied,
            fee_amount=row.fee_amount,
            status=row.status,
            paid_at=row.paid_at,
            paid_method=row.paid_method,
        )
        for row in recent_q.scalars().all()
    ]

    # F-5b-2 dunning level (mirror of perf_fee.evaluate_dunning thresholds)
    pending_n = int(pending_count or 0)
    if account.dunning_pause_active:
        dunning_level = "paused"
    elif pending_n >= 2:
        dunning_level = "warning"
    else:
        dunning_level = "ok"

    return ApiResponse[EarnFeeSummaryOut].ok(
        EarnFeeSummaryOut(
            perf_fee_bps=account.perf_fee_bps,
            is_premium=is_premium,
            pending_accrued_usdt=pending_sum,
            pending_count=pending_n,
            quiver_wallet_balance_usdt=wallet_balance,
            has_buffer_warning=has_warning,
            dunning_level=dunning_level,
            dunning_pause_active=account.dunning_pause_active,
            paid_30d_usdt=paid_30d,
            paid_lifetime_usdt=paid_lifetime,
            last_paid_at=last_paid_at,
            next_settle_at=next_settle,
            recent_accruals=recent,
        )
    )


# ─────────────────────────────────────────────────────────
# F-5a-4.3 — Public leaderboard (/api/earn/rank, no auth)
# ─────────────────────────────────────────────────────────


# Minimum days of snapshot data a user must have to qualify for the
# leaderboard. Lower threshold = more populated leaderboard sooner; higher
# threshold = harder to game with one-day flukes. During dogfooding (few
# users) keep low; bump as platform scales.
RANK_MIN_DAYS = 1
RANK_LIMIT = 20

# Process-local cache (mirrors public-stats pattern). Reset on api restart.
_RANK_CACHE_TTL_SEC = 60.0
_rank_cache: tuple[float, EarnRankOut] | None = None


def _anonymous_handle(user_id: int) -> str:
    """Stable 4-hex-char hash for anonymous leaderboard display.

    Same user_id always produces the same handle so the user can recognize
    themselves across visits. Not cryptographically secret (4 hex = 65k
    space, trivially brute-forceable from user_id), but the leaderboard
    doesn't need that — anonymity here is about not LEAKING the username,
    not preventing reverse-mapping.
    """
    import hashlib
    digest = hashlib.sha256(f"quiver-rank-{user_id}".encode()).hexdigest()
    return f"Anonymous #{digest[:4].upper()}"


@router.get("/rank", response_model=ApiResponse[EarnRankOut])
async def get_earn_rank(db: DbDep) -> ApiResponse[EarnRankOut]:
    """Public leaderboard of Quiver users by 30-day weighted APR.

    Computation:
      - For each user (account), aggregate over snapshots in last 30 days:
        * total_earned = sum(daily_earned)
        * total_lent_days = sum(lent_usdt)  ← weight by amount × days
        * days_active = COUNT(*)
      - weighted_apr = (total_earned / total_lent_days) × 365 × 100
      - Filter: days_active >= RANK_MIN_DAYS, total_lent_days > 0
      - Sort desc, top RANK_LIMIT

    Display name resolution:
      - User opted in (show_on_leaderboard=True) AND has telegram_username
        → "@telegram_username"
      - Otherwise → "Anonymous #XXXX" (stable hash)

    Privacy: never expose total_lent or any wealth signal — pure performance
    rankings only. No auth required (this is the social proof page).
    """
    global _rank_cache
    now = time.time()
    if _rank_cache is not None and now - _rank_cache[0] < _RANK_CACHE_TTL_SEC:
        return ApiResponse[EarnRankOut].ok(_rank_cache[1])

    cutoff = date.today() - timedelta(days=30)

    # CTE-style aggregate per user
    rank_q = await db.execute(
        select(
            EarnAccount.user_id,
            func.sum(EarnPositionSnapshot.bitfinex_daily_earned).label("total_earned"),
            func.sum(EarnPositionSnapshot.bitfinex_lent_usdt).label("total_lent_days"),
            func.count(EarnPositionSnapshot.id).label("days_active"),
        )
        .join(
            EarnAccount,
            EarnAccount.id == EarnPositionSnapshot.earn_account_id,
        )
        .where(
            EarnPositionSnapshot.snapshot_date >= cutoff,
            EarnPositionSnapshot.bitfinex_daily_earned.isnot(None),
            EarnPositionSnapshot.bitfinex_lent_usdt.isnot(None),
            EarnPositionSnapshot.bitfinex_lent_usdt > 0,
            EarnAccount.archived_at.is_(None),
        )
        .group_by(EarnAccount.user_id)
        .having(func.count(EarnPositionSnapshot.id) >= RANK_MIN_DAYS)
    )

    rows = []
    for row in rank_q.all():
        total_earned = Decimal(str(row.total_earned or 0))
        total_lent_days = Decimal(str(row.total_lent_days or 0))
        if total_lent_days <= 0:
            continue
        apr = (total_earned / total_lent_days * Decimal(365) * Decimal(100)).quantize(
            Decimal("0.01")
        )
        rows.append(
            (row.user_id, apr, int(row.days_active or 0))
        )

    # Sort desc by APR
    rows.sort(key=lambda r: r[1], reverse=True)
    qualified_count = len(rows)
    rows = rows[:RANK_LIMIT]

    # Bulk-lookup user records to resolve display name + premium state
    if rows:
        user_ids = [uid for uid, _, _ in rows]
        users_q = await db.execute(
            select(User.id, User.telegram_username, User.show_on_leaderboard).where(
                User.id.in_(user_ids)
            )
        )
        user_meta = {
            uid: (tg_username, opted_in)
            for uid, tg_username, opted_in in users_q.all()
        }
        # Bulk-check premium status
        premium_set: set[int] = set()
        for uid in user_ids:
            try:
                if await sub_repo.is_user_premium(db, uid):
                    premium_set.add(uid)
            except Exception:  # noqa: BLE001
                pass
    else:
        user_meta = {}
        premium_set = set()

    entries: list[RankEntryOut] = []
    for rank, (uid, apr, days_active) in enumerate(rows, start=1):
        tg_username, opted_in = user_meta.get(uid, (None, False))
        if opted_in and tg_username:
            display_name = f"@{tg_username}"
            is_anon = False
        else:
            display_name = _anonymous_handle(uid)
            is_anon = True
        entries.append(
            RankEntryOut(
                rank=rank,
                display_name=display_name,
                is_anonymous=is_anon,
                apr_30d_pct=apr,
                days_active=days_active,
                is_premium=uid in premium_set,
            )
        )

    result = EarnRankOut(
        entries=entries,
        total_qualified_count=qualified_count,
        min_days_threshold=RANK_MIN_DAYS,
        last_updated_at=datetime.now(timezone.utc),
    )
    _rank_cache = (now, result)
    return ApiResponse[EarnRankOut].ok(result)
