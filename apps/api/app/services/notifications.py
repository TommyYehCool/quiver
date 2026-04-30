"""Notification service — 給其他 service 呼叫的 helper。

設計:create_notification 需要 caller 傳 db session。**不會自己 commit**,讓 caller
決定整個 transaction 邊界(避免在外部 transaction 已 fail 時還寫通知造成不一致)。

對 list / mark_read / count_unread:用獨立 commit(API endpoint 直接呼叫)。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.notification import Notification, NotificationType

logger = get_logger(__name__)


def create_notification(
    db: AsyncSession,
    user_id: int,
    notification_type: NotificationType,
    params: dict[str, Any] | None = None,
) -> Notification:
    """創建通知。**caller 要自己 commit**。"""
    n = Notification(
        user_id=user_id,
        type=notification_type.value,
        params=params or {},
    )
    db.add(n)
    return n


async def list_user_notifications(
    db: AsyncSession,
    user_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    total_q = await db.execute(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id)
    )
    total = total_q.scalar_one()
    rows_q = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.id.desc())
        .offset(offset)
        .limit(min(limit, 100))
    )
    return list(rows_q.scalars().all()), total


async def count_unread(db: AsyncSession, user_id: int) -> int:
    q = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return q.scalar_one()


async def mark_read(db: AsyncSession, user_id: int, notification_id: int) -> bool:
    """標記單筆已讀。回 True 代表有更新到(idempotent — 已讀再標一次仍 True)。"""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .values(read_at=now)
    )
    await db.commit()
    return (res.rowcount or 0) > 0


async def mark_all_read(db: AsyncSession, user_id: int) -> int:
    """全部標已讀,回更新數量。"""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=now)
    )
    await db.commit()
    return res.rowcount or 0
