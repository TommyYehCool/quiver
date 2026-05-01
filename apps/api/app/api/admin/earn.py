"""Admin Earn endpoints — Friends Tooling F-Phase 1。

CRUD for earn_accounts:
- GET  /api/admin/earn/users — 可被 elevate 的 user 下拉
- GET  /api/admin/earn/accounts — list 所有 earn 帳戶
- GET  /api/admin/earn/accounts/{id} — 單一帳戶詳情(含部位 / 連線 / 地址)
- POST /api/admin/earn/accounts — 新增 friend earn 帳戶
- PATCH /api/admin/earn/accounts/{id} — 更新 perf_fee / can_quiver_operate / notes / archived
- POST /api/admin/earn/accounts/{id}/connections/{conn_id}/revoke — 撤銷 Bitfinex key
- POST /api/admin/earn/accounts/{id}/sync — 立刻同步該帳戶部位
- POST /api/admin/earn/sync-all — 一次同步所有帳戶
- GET  /api/admin/earn/ranking — 跨朋友 30 天 APY 排行
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.logging import get_logger
from app.models.earn import (
    BitfinexPermissions,
    CustodyMode,
    EarnAccount,
    EarnTier,
)
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.earn import (
    BitfinexConnectionOut,
    CreateEarnAccountIn,
    EarnAccountDetailOut,
    EarnAccountListOut,
    EarnAccountOut,
    EvmAddressOut,
    FriendApySummary,
    FriendUserOption,
    PositionSnapshotOut,
    SyncResultOut,
    UpdateEarnAccountIn,
)
from app.services.earn import encryption as earn_crypto
from app.services.earn import repo as earn_repo

router = APIRouter(prefix="/api/admin/earn", tags=["admin-earn"])
logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────


async def _to_account_out(
    db: DbDep, account: EarnAccount, user: User
) -> EarnAccountOut:
    bf_conn = await earn_repo.get_active_bitfinex_connection(db, account.id)
    evm_addrs = await earn_repo.list_evm_addresses(db, account.id)
    onboarder_email: str | None = None
    if account.onboarded_by:
        ob_q = await db.execute(
            select(User).where(User.id == account.onboarded_by)
        )
        ob = ob_q.scalar_one_or_none()
        onboarder_email = ob.email if ob else None
    return EarnAccountOut(
        id=account.id,
        user_id=account.user_id,
        user_email=user.email,
        user_display_name=user.display_name,
        earn_tier=user.earn_tier,
        custody_mode=account.custody_mode,
        perf_fee_bps=account.perf_fee_bps,
        can_quiver_operate=account.can_quiver_operate,
        onboarded_by=account.onboarded_by,
        onboarded_by_email=onboarder_email,
        risk_acknowledged_at=account.risk_acknowledged_at,
        notes=account.notes,
        archived_at=account.archived_at,
        created_at=account.created_at,
        updated_at=account.updated_at,
        has_active_bitfinex=(bf_conn is not None),
        bitfinex_permissions=bf_conn.permissions if bf_conn else None,
        evm_addresses_count=len(evm_addrs),
    )


# ─────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────


@router.get("/users", response_model=ApiResponse[list[FriendUserOption]])
async def list_eligible_users(
    _: CurrentAdminDep, db: DbDep
) -> ApiResponse[list[FriendUserOption]]:
    """列出還沒參加 Earn 的既有 user(供 admin 加 friend 下拉用)。"""
    users = await earn_repo.list_friend_user_options(db)
    items = [
        FriendUserOption(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            earn_tier=u.earn_tier,
        )
        for u in users
    ]
    return ApiResponse.ok(items)


@router.get("/accounts", response_model=ApiResponse[EarnAccountListOut])
async def list_earn_accounts(
    _: CurrentAdminDep,
    db: DbDep,
    include_archived: bool = False,
) -> ApiResponse[EarnAccountListOut]:
    """List 所有 earn 帳戶(預設不含 archived)。"""
    rows = await earn_repo.list_accounts(db, include_archived=include_archived)
    items: list[EarnAccountOut] = []
    for ea, u in rows:
        items.append(await _to_account_out(db, ea, u))
    return ApiResponse.ok(EarnAccountListOut(items=items, total=len(items)))


@router.get("/accounts/{account_id}", response_model=ApiResponse[EarnAccountDetailOut])
async def get_earn_account_detail(
    account_id: int, _: CurrentAdminDep, db: DbDep
) -> ApiResponse[EarnAccountDetailOut]:
    account = await earn_repo.get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "earn.notFound"},
        )
    user_q = await db.execute(select(User).where(User.id == account.user_id))
    user = user_q.scalar_one()

    base = await _to_account_out(db, account, user)
    connections = await earn_repo.list_bitfinex_connections(db, account.id)
    evm_addrs = await earn_repo.list_evm_addresses(db, account.id)
    snaps = await earn_repo.list_recent_snapshots(db, account.id, days=30)

    return ApiResponse.ok(
        EarnAccountDetailOut(
            **base.model_dump(),
            bitfinex_connections=[
                BitfinexConnectionOut(
                    id=c.id,
                    is_platform_key=c.is_platform_key,
                    permissions=c.permissions,
                    has_key=bool(c.encrypted_api_key),
                    created_at=c.created_at,
                    revoked_at=c.revoked_at,
                )
                for c in connections
            ],
            evm_addresses=[
                EvmAddressOut(
                    id=a.id,
                    chain=a.chain,
                    address=a.address,
                    is_platform_address=a.is_platform_address,
                    label=a.label,
                    created_at=a.created_at,
                )
                for a in evm_addrs
            ],
            recent_snapshots=[
                PositionSnapshotOut(
                    snapshot_date=s.snapshot_date,
                    bitfinex_funding_usdt=s.bitfinex_funding_usdt,
                    bitfinex_lent_usdt=s.bitfinex_lent_usdt,
                    bitfinex_daily_earned=s.bitfinex_daily_earned,
                    aave_polygon_usdt=s.aave_polygon_usdt,
                    aave_daily_apr=s.aave_daily_apr,
                    total_usdt=s.total_usdt,
                )
                for s in snaps
            ],
        )
    )


@router.post("/accounts", response_model=ApiResponse[EarnAccountOut])
async def create_earn_account(
    payload: CreateEarnAccountIn,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[EarnAccountOut]:
    """新增 friend earn 帳戶 + Bitfinex key + (optional) EVM address。"""
    # 1. 找目標 user
    user_q = await db.execute(select(User).where(User.id == payload.user_id))
    user = user_q.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "user.notFound"},
        )

    # 2. 檢查還沒 earn_account
    existing = await earn_repo.get_account_by_user_id(db, payload.user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "earn.alreadyExists"},
        )

    # 3. 檢查 friends 數上限(F-Phase 1: max 10)
    if payload.earn_tier == EarnTier.FRIEND.value:
        active = await earn_repo.count_active_accounts(db)
        # active 包含 internal,所以閾值放寬一點
        if active >= 11:  # 10 friends + 1 Tommy internal
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "earn.tooManyFriends",
                    "params": {"max": 10, "current": active - 1},
                },
            )

    # 4. 建 earn_account
    account = await earn_repo.create_earn_account(
        db,
        user_id=payload.user_id,
        custody_mode=payload.custody_mode,
        perf_fee_bps=payload.perf_fee_bps,
        can_quiver_operate=payload.can_quiver_operate,
        onboarded_by=admin.id,
        notes=payload.notes,
    )

    # 5. 加密 + 寫 Bitfinex 連線
    if payload.custody_mode == CustodyMode.SELF.value:
        try:
            cipher_key, key_ver = await earn_crypto.encrypt_bitfinex_key(
                db, plaintext=payload.bitfinex_api_key
            )
            cipher_secret, _ = await earn_crypto.encrypt_bitfinex_key(
                db, plaintext=payload.bitfinex_api_secret
            )
        except Exception as e:
            logger.error("earn_create_encrypt_failed", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "earn.encryptFailed"},
            ) from e
        await earn_repo.add_bitfinex_connection(
            db,
            earn_account_id=account.id,
            is_platform_key=False,
            encrypted_api_key=cipher_key,
            encrypted_api_secret=cipher_secret,
            key_version=key_ver,
            permissions=payload.bitfinex_permissions,
        )

    # 6. 加 EVM 地址(可選)
    if payload.evm_polygon_address:
        await earn_repo.add_evm_address(
            db,
            earn_account_id=account.id,
            chain="polygon",
            address=payload.evm_polygon_address,
            is_platform_address=False,
            label=payload.evm_label,
        )

    # 7. 升級 user.earn_tier
    await earn_repo.update_user_earn_tier(
        db, user_id=user.id, earn_tier=payload.earn_tier
    )
    await db.commit()
    await db.refresh(user)
    await db.refresh(account)

    logger.info(
        "earn_account_created",
        admin_id=admin.id,
        user_id=user.id,
        account_id=account.id,
        earn_tier=payload.earn_tier,
        custody_mode=payload.custody_mode,
        perf_fee_bps=payload.perf_fee_bps,
    )
    out = await _to_account_out(db, account, user)
    return ApiResponse.ok(out)


@router.patch(
    "/accounts/{account_id}", response_model=ApiResponse[EarnAccountOut]
)
async def update_earn_account_endpoint(
    account_id: int,
    payload: UpdateEarnAccountIn,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[EarnAccountOut]:
    account = await earn_repo.get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "earn.notFound"},
        )
    updated = await earn_repo.update_earn_account(
        db,
        account_id=account_id,
        perf_fee_bps=payload.perf_fee_bps,
        can_quiver_operate=payload.can_quiver_operate,
        notes=payload.notes,
        archived=payload.archived,
    )
    if updated is None:
        raise HTTPException(status_code=500, detail={"code": "earn.updateFailed"})
    await db.commit()
    user_q = await db.execute(select(User).where(User.id == updated.user_id))
    user = user_q.scalar_one()
    logger.info(
        "earn_account_updated",
        admin_id=admin.id,
        account_id=account_id,
        changes=payload.model_dump(exclude_unset=True),
    )
    out = await _to_account_out(db, updated, user)
    return ApiResponse.ok(out)


@router.post(
    "/accounts/{account_id}/connections/{conn_id}/revoke",
    response_model=ApiResponse[None],
)
async def revoke_bitfinex_connection(
    account_id: int,
    conn_id: int,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[None]:
    account = await earn_repo.get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "earn.notFound"},
        )
    await earn_repo.revoke_bitfinex_connection(db, conn_id)
    await db.commit()
    logger.info(
        "earn_bitfinex_revoked",
        admin_id=admin.id,
        account_id=account_id,
        connection_id=conn_id,
    )
    return ApiResponse.ok(None)


@router.post(
    "/accounts/{account_id}/sync", response_model=ApiResponse[SyncResultOut]
)
async def sync_account_now(
    account_id: int,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[SyncResultOut]:
    """手動觸發同步該帳戶當前部位。"""
    from app.services.earn.sync import sync_one_account

    account = await earn_repo.get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "earn.notFound"},
        )
    result = await sync_one_account(db, account.id, snapshot_date=date.today())
    await db.commit()
    logger.info(
        "earn_account_synced",
        admin_id=admin.id,
        account_id=account_id,
        success=result.success,
        error=result.error,
    )
    return ApiResponse.ok(result)


@router.post("/sync-all", response_model=ApiResponse[list[SyncResultOut]])
async def sync_all_accounts(
    admin: CurrentAdminDep, db: DbDep
) -> ApiResponse[list[SyncResultOut]]:
    """一次同步所有 active earn 帳戶。"""
    from app.services.earn.sync import sync_one_account

    rows = await earn_repo.list_accounts(db, include_archived=False)
    results: list[SyncResultOut] = []
    for ea, _user in rows:
        r = await sync_one_account(db, ea.id, snapshot_date=date.today())
        results.append(r)
    await db.commit()
    logger.info(
        "earn_sync_all_done",
        admin_id=admin.id,
        accounts=len(results),
        successful=sum(1 for r in results if r.success),
    )
    return ApiResponse.ok(results)


@router.get("/ranking", response_model=ApiResponse[list[FriendApySummary]])
async def get_friend_ranking(
    _: CurrentAdminDep, db: DbDep
) -> ApiResponse[list[FriendApySummary]]:
    """過去 30 天朋友 APY 表現排行。"""
    from decimal import Decimal as Dec

    rows = await earn_repo.list_accounts(db, include_archived=False)
    summaries: list[FriendApySummary] = []
    for ea, user in rows:
        snaps = await earn_repo.list_recent_snapshots(db, ea.id, days=30)
        if not snaps:
            summaries.append(
                FriendApySummary(
                    earn_account_id=ea.id,
                    user_email=user.email,
                    user_display_name=user.display_name,
                    total_usdt=None,
                    avg_30d_apy_pct=None,
                    bitfinex_share_pct=None,
                    aave_share_pct=None,
                )
            )
            continue
        latest = snaps[-1]
        # 簡化 APY 估算:用最近 14 天每日 earned 平均 / 平均部位 × 365
        # 這裡只取最近 snapshot 的 aave_apr 跟 bitfinex 推估
        total = latest.total_usdt or Dec(0)
        bitfinex_total = (latest.bitfinex_funding_usdt or Dec(0)) + (
            latest.bitfinex_lent_usdt or Dec(0)
        )
        aave_total = latest.aave_polygon_usdt or Dec(0)
        bitfinex_pct = (
            bitfinex_total / total * 100 if total else None
        )
        aave_pct = aave_total / total * 100 if total else None

        # 30 天 APY:用 daily earned 累加 / 平均部位 / 天數 * 365
        sum_daily = sum(
            (s.bitfinex_daily_earned or Dec(0)) for s in snaps
        )
        avg_total = sum(
            (s.total_usdt or Dec(0)) for s in snaps
        ) / Dec(len(snaps)) if snaps else Dec(0)
        if avg_total > 0 and len(snaps) > 0:
            apy = (sum_daily / avg_total) * (Dec(365) / Dec(len(snaps))) * Dec(100)
        else:
            apy = None
        # AAVE 部分用最近 APR snapshot
        if latest.aave_daily_apr and latest.aave_polygon_usdt and total > 0:
            aave_contrib = (
                latest.aave_daily_apr * (latest.aave_polygon_usdt / total) * Dec(100)
            )
            apy = (apy or Dec(0)) + aave_contrib

        summaries.append(
            FriendApySummary(
                earn_account_id=ea.id,
                user_email=user.email,
                user_display_name=user.display_name,
                total_usdt=total,
                avg_30d_apy_pct=apy,
                bitfinex_share_pct=bitfinex_pct,
                aave_share_pct=aave_pct,
            )
        )

    # 按 APY 排序(None 排最後)
    summaries.sort(
        key=lambda s: (s.avg_30d_apy_pct or Dec("-1")),
        reverse=True,
    )
    return ApiResponse.ok(summaries)
