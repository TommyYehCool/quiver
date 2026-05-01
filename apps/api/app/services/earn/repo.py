"""Repository for earn_accounts + 關聯表。

負責所有 DB CRUD,讓 endpoint / cron / adapter 共用同一份。
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.earn import (
    EarnAccount,
    EarnBitfinexConnection,
    EarnEvmAddress,
    EarnPositionSnapshot,
    FeeAccrualStatus,
)
from app.models.user import User


# ─────────────────────────────────────────────────────────
# EarnAccount CRUD
# ─────────────────────────────────────────────────────────


async def list_friend_user_options(db: AsyncSession) -> list[User]:
    """列出可以被 elevate 為 earn 的 user(earn_tier='none' 且還沒 earn_account)。"""
    sub = select(EarnAccount.user_id)
    q = await db.execute(
        select(User)
        .where(User.id.notin_(sub))
        .where(User.earn_tier == "none")
        .order_by(User.email)
    )
    return list(q.scalars().all())


async def get_account_by_id(db: AsyncSession, account_id: int) -> EarnAccount | None:
    q = await db.execute(
        select(EarnAccount).where(EarnAccount.id == account_id)
    )
    return q.scalar_one_or_none()


async def get_account_by_user_id(
    db: AsyncSession, user_id: int
) -> EarnAccount | None:
    q = await db.execute(
        select(EarnAccount).where(EarnAccount.user_id == user_id)
    )
    return q.scalar_one_or_none()


async def list_accounts(
    db: AsyncSession, *, include_archived: bool = False
) -> list[tuple[EarnAccount, User]]:
    """List all earn accounts joined with user."""
    stmt = select(EarnAccount, User).join(User, User.id == EarnAccount.user_id)
    if not include_archived:
        stmt = stmt.where(EarnAccount.archived_at.is_(None))
    stmt = stmt.order_by(EarnAccount.created_at.desc())
    q = await db.execute(stmt)
    return [(ea, u) for ea, u in q.all()]


async def count_active_accounts(db: AsyncSession) -> int:
    q = await db.execute(
        select(func.count(EarnAccount.id)).where(EarnAccount.archived_at.is_(None))
    )
    return int(q.scalar() or 0)


async def create_earn_account(
    db: AsyncSession,
    *,
    user_id: int,
    custody_mode: str,
    perf_fee_bps: int,
    can_quiver_operate: bool,
    onboarded_by: int,
    notes: str | None,
) -> EarnAccount:
    """注意:caller 自己要更新 user.earn_tier 跟 commit。"""
    account = EarnAccount(
        user_id=user_id,
        custody_mode=custody_mode,
        perf_fee_bps=perf_fee_bps,
        can_quiver_operate=can_quiver_operate,
        onboarded_by=onboarded_by,
        notes=notes,
    )
    db.add(account)
    await db.flush()  # 拿 id
    return account


async def update_earn_account(
    db: AsyncSession,
    *,
    account_id: int,
    perf_fee_bps: int | None = None,
    can_quiver_operate: bool | None = None,
    notes: str | None = None,
    archived: bool | None = None,
) -> EarnAccount | None:
    values: dict[str, Any] = {}
    if perf_fee_bps is not None:
        values["perf_fee_bps"] = perf_fee_bps
    if can_quiver_operate is not None:
        values["can_quiver_operate"] = can_quiver_operate
    if notes is not None:
        values["notes"] = notes
    if archived is True:
        values["archived_at"] = datetime.utcnow()
    elif archived is False:
        values["archived_at"] = None

    if values:
        await db.execute(
            update(EarnAccount).where(EarnAccount.id == account_id).values(**values)
        )
    return await get_account_by_id(db, account_id)


async def update_user_earn_tier(
    db: AsyncSession, *, user_id: int, earn_tier: str
) -> None:
    await db.execute(
        update(User).where(User.id == user_id).values(earn_tier=earn_tier)
    )


# ─────────────────────────────────────────────────────────
# Bitfinex connection
# ─────────────────────────────────────────────────────────


async def add_bitfinex_connection(
    db: AsyncSession,
    *,
    earn_account_id: int,
    is_platform_key: bool,
    encrypted_api_key: str | None,
    encrypted_api_secret: str | None,
    key_version: int | None,
    permissions: str,
) -> EarnBitfinexConnection:
    conn = EarnBitfinexConnection(
        earn_account_id=earn_account_id,
        is_platform_key=is_platform_key,
        encrypted_api_key=encrypted_api_key,
        encrypted_api_secret=encrypted_api_secret,
        key_version=key_version,
        permissions=permissions,
    )
    db.add(conn)
    await db.flush()
    return conn


async def get_active_bitfinex_connection(
    db: AsyncSession, earn_account_id: int
) -> EarnBitfinexConnection | None:
    """取得當前 active 的 connection(revoked_at IS NULL,最新一筆)。"""
    q = await db.execute(
        select(EarnBitfinexConnection)
        .where(
            and_(
                EarnBitfinexConnection.earn_account_id == earn_account_id,
                EarnBitfinexConnection.revoked_at.is_(None),
            )
        )
        .order_by(EarnBitfinexConnection.created_at.desc())
        .limit(1)
    )
    return q.scalar_one_or_none()


async def list_bitfinex_connections(
    db: AsyncSession, earn_account_id: int
) -> list[EarnBitfinexConnection]:
    q = await db.execute(
        select(EarnBitfinexConnection)
        .where(EarnBitfinexConnection.earn_account_id == earn_account_id)
        .order_by(EarnBitfinexConnection.created_at.desc())
    )
    return list(q.scalars().all())


async def revoke_bitfinex_connection(
    db: AsyncSession, connection_id: int
) -> None:
    await db.execute(
        update(EarnBitfinexConnection)
        .where(EarnBitfinexConnection.id == connection_id)
        .where(EarnBitfinexConnection.revoked_at.is_(None))
        .values(revoked_at=datetime.utcnow())
    )


# ─────────────────────────────────────────────────────────
# EVM address
# ─────────────────────────────────────────────────────────


async def add_evm_address(
    db: AsyncSession,
    *,
    earn_account_id: int,
    chain: str,
    address: str,
    is_platform_address: bool,
    label: str | None,
) -> EarnEvmAddress:
    addr = EarnEvmAddress(
        earn_account_id=earn_account_id,
        chain=chain,
        address=address,
        is_platform_address=is_platform_address,
        label=label,
    )
    db.add(addr)
    await db.flush()
    return addr


async def list_evm_addresses(
    db: AsyncSession, earn_account_id: int
) -> list[EarnEvmAddress]:
    q = await db.execute(
        select(EarnEvmAddress)
        .where(EarnEvmAddress.earn_account_id == earn_account_id)
        .order_by(EarnEvmAddress.created_at.desc())
    )
    return list(q.scalars().all())


# ─────────────────────────────────────────────────────────
# Position snapshots
# ─────────────────────────────────────────────────────────


async def upsert_snapshot(
    db: AsyncSession,
    *,
    earn_account_id: int,
    snapshot_date: date,
    bitfinex_funding_usdt: Decimal | None = None,
    bitfinex_lent_usdt: Decimal | None = None,
    bitfinex_daily_earned: Decimal | None = None,
    aave_polygon_usdt: Decimal | None = None,
    aave_daily_apr: Decimal | None = None,
    total_usdt: Decimal | None = None,
) -> EarnPositionSnapshot:
    """寫入或更新某天的 snapshot(unique on earn_account_id + snapshot_date)。"""
    q = await db.execute(
        select(EarnPositionSnapshot).where(
            and_(
                EarnPositionSnapshot.earn_account_id == earn_account_id,
                EarnPositionSnapshot.snapshot_date == snapshot_date,
            )
        )
    )
    existing = q.scalar_one_or_none()
    if existing:
        existing.bitfinex_funding_usdt = bitfinex_funding_usdt
        existing.bitfinex_lent_usdt = bitfinex_lent_usdt
        existing.bitfinex_daily_earned = bitfinex_daily_earned
        existing.aave_polygon_usdt = aave_polygon_usdt
        existing.aave_daily_apr = aave_daily_apr
        existing.total_usdt = total_usdt
        await db.flush()
        return existing
    snap = EarnPositionSnapshot(
        earn_account_id=earn_account_id,
        snapshot_date=snapshot_date,
        bitfinex_funding_usdt=bitfinex_funding_usdt,
        bitfinex_lent_usdt=bitfinex_lent_usdt,
        bitfinex_daily_earned=bitfinex_daily_earned,
        aave_polygon_usdt=aave_polygon_usdt,
        aave_daily_apr=aave_daily_apr,
        total_usdt=total_usdt,
    )
    db.add(snap)
    await db.flush()
    return snap


async def list_recent_snapshots(
    db: AsyncSession, earn_account_id: int, days: int = 30
) -> list[EarnPositionSnapshot]:
    """取最近 N 天 snapshot,按日期遞增。"""
    cutoff = date.today() - timedelta(days=days)
    q = await db.execute(
        select(EarnPositionSnapshot)
        .where(
            and_(
                EarnPositionSnapshot.earn_account_id == earn_account_id,
                EarnPositionSnapshot.snapshot_date >= cutoff,
            )
        )
        .order_by(EarnPositionSnapshot.snapshot_date.asc())
    )
    return list(q.scalars().all())


async def get_latest_snapshot(
    db: AsyncSession, earn_account_id: int
) -> EarnPositionSnapshot | None:
    q = await db.execute(
        select(EarnPositionSnapshot)
        .where(EarnPositionSnapshot.earn_account_id == earn_account_id)
        .order_by(desc(EarnPositionSnapshot.snapshot_date))
        .limit(1)
    )
    return q.scalar_one_or_none()
