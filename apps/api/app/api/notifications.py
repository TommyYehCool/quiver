"""Notifications endpoints — 看自己的通知 + 標已讀。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.schemas.api import ApiResponse
from app.schemas.notification import (
    NotificationListOut,
    NotificationOut,
    UnreadCountOut,
)
from app.services.notifications import (
    count_unread,
    list_user_notifications,
    mark_all_read,
    mark_read,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
logger = get_logger(__name__)


@router.get("", response_model=ApiResponse[NotificationListOut])
async def list_notifications(
    user: CurrentUserDep,
    db: DbDep,
    limit: int = 20,
    offset: int = 0,
) -> ApiResponse[NotificationListOut]:
    items, total = await list_user_notifications(db, user.id, limit=limit, offset=offset)
    unread = await count_unread(db, user.id)
    return ApiResponse[NotificationListOut].ok(
        NotificationListOut(
            items=[NotificationOut.model_validate(n) for n in items],
            total=total,
            unread=unread,
        )
    )


@router.get("/unread-count", response_model=ApiResponse[UnreadCountOut])
async def get_unread_count(
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[UnreadCountOut]:
    unread = await count_unread(db, user.id)
    return ApiResponse[UnreadCountOut].ok(UnreadCountOut(unread=unread))


@router.post("/{notification_id}/read", response_model=ApiResponse[UnreadCountOut])
async def mark_one_read(
    notification_id: int,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[UnreadCountOut]:
    await mark_read(db, user.id, notification_id)
    unread = await count_unread(db, user.id)
    return ApiResponse[UnreadCountOut].ok(UnreadCountOut(unread=unread))


@router.post("/read-all", response_model=ApiResponse[UnreadCountOut])
async def post_mark_all_read(
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[UnreadCountOut]:
    await mark_all_read(db, user.id)
    return ApiResponse[UnreadCountOut].ok(UnreadCountOut(unread=0))
