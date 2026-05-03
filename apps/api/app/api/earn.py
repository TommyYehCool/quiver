"""User-facing Earn endpoints (F-Phase 3 / Path A self-service).

- GET   /api/earn/me        — user's own earn state (account, positions, snapshot)
- PATCH /api/earn/settings  — toggle auto_lend_enabled
- POST  /api/earn/connect   — submit Bitfinex API key + funding address (gated by KYC)

Admin-only earn management lives in apps/api/app/api/admin/earn.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.models.earn import (
    BitfinexPermissions,
    CustodyMode,
    EarnAccount,
    EarnBitfinexConnection,
    EarnPosition,
    EarnPositionStatus,
    EarnTier,
)
from app.models.kyc import KycStatus, KycSubmission
from app.schemas.api import ApiResponse
from app.schemas.earn_user import (
    EarnConnectIn,
    EarnConnectOut,
    EarnMeOut,
    EarnPositionUserOut,
    EarnSettingsOut,
    EarnSettingsUpdateIn,
    EarnSnapshotUserOut,
)
from app.services.earn import encryption as earn_crypto
from app.services.earn import repo as earn_repo
from app.services.earn.bitfinex_adapter import BitfinexFundingAdapter

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
    if account is None:
        return ApiResponse[EarnMeOut].ok(
            EarnMeOut(
                kyc_status=kyc_status,
                can_connect=can_connect,
                has_earn_account=False,
                auto_lend_enabled=False,
                bitfinex_connected=False,
                bitfinex_funding_address=None,
                funding_idle_usdt=None,
                lent_usdt=None,
                daily_earned_usdt=None,
                total_at_bitfinex=None,
                active_positions=[],
                recent_snapshots=[],
            )
        )

    conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    snapshots = await earn_repo.list_recent_snapshots(db, account.id, days=30)
    latest = snapshots[-1] if snapshots else None
    active_positions = await _list_active_positions(db, account.id)

    funding_idle = latest.bitfinex_funding_usdt if latest else None
    lent = latest.bitfinex_lent_usdt if latest else None
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
            bitfinex_connected=conn is not None,
            bitfinex_funding_address=account.bitfinex_funding_address,
            funding_idle_usdt=funding_idle,
            lent_usdt=lent,
            daily_earned_usdt=latest.bitfinex_daily_earned if latest else None,
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
    if payload.auto_lend_enabled is not None:
        account.auto_lend_enabled = payload.auto_lend_enabled
        await db.commit()
        logger.info(
            "earn_auto_lend_toggled",
            user_id=user.id,
            earn_account_id=account.id,
            new_value=payload.auto_lend_enabled,
        )
    return ApiResponse[EarnSettingsOut].ok(
        EarnSettingsOut(auto_lend_enabled=account.auto_lend_enabled)
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
    # Step 1: KYC gate
    kyc_status = await _get_kyc_status(db, user.id)
    if kyc_status != KycStatus.APPROVED.value:
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
        # Fresh user — create earn_account
        account = await earn_repo.create_earn_account(
            db,
            user_id=user.id,
            custody_mode=CustodyMode.SELF.value,
            perf_fee_bps=0,
            can_quiver_operate=True,  # self-service implies user wants Quiver to operate
            onboarded_by=user.id,  # self-onboarding
            notes=None,
        )
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

    # Promote user.earn_tier to 'friend' (default for self-service Path A MVP)
    if user.earn_tier == EarnTier.NONE.value:
        user.earn_tier = EarnTier.FRIEND.value

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
        )
    )
