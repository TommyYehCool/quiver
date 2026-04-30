"""Admin: 處理用戶刪除申請(phase 6E-1)。"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.api.deps import CurrentAdminDep, DbDep
from app.core.logging import get_logger
from app.models.login_session import LoginSession
from app.models.user import User, UserStatus
from app.schemas.api import ApiResponse
from app.services.ledger import get_user_balance

router = APIRouter(prefix="/api/admin/deletion-requests", tags=["admin-deletions"])
logger = get_logger(__name__)


class DeletionRequestRow(BaseModel):
    user_id: int
    email: str
    display_name: str | None
    requested_at: datetime
    balance: Decimal
    completed_at: datetime | None


class DeletionListOut(BaseModel):
    items: list[DeletionRequestRow]


@router.get("", response_model=ApiResponse[DeletionListOut])
async def list_deletion_requests(_: CurrentAdminDep, db: DbDep) -> ApiResponse[DeletionListOut]:
    """列出有 deletion_requested_at 的用戶,含當前餘額(admin 要確認 = 0 才能刪)。"""
    q = await db.execute(
        select(User)
        .where(User.deletion_requested_at.is_not(None))
        .order_by(User.deletion_requested_at.desc())
    )
    rows = []
    for u in q.scalars().all():
        bal = await get_user_balance(db, user_id=u.id)
        rows.append(
            DeletionRequestRow(
                user_id=u.id,
                email=u.email,
                display_name=u.display_name,
                requested_at=u.deletion_requested_at,  # type: ignore[arg-type]
                balance=bal,
                completed_at=u.deletion_completed_at,
            )
        )
    return ApiResponse[DeletionListOut].ok(DeletionListOut(items=rows))


@router.post("/{user_id}/complete", response_model=ApiResponse[dict])
async def complete_deletion(
    user_id: int,
    _: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[dict]:
    """完成刪除 — soft delete:
    - status → SUSPENDED
    - email → deleted-{id}@quiver.deleted(讓 email 釋出可重新註冊)
    - revoke 所有 sessions
    - 標記 deletion_completed_at

    為什麼不真刪資料庫紀錄:
    - 法遵需保留交易紀錄 N 年(會計法 / 稅法)
    - ledger 不能斷,user 是 ledger entries 的外鍵
    """
    q = await db.execute(select(User).where(User.id == user_id))
    user = q.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail={"code": "user.notFound"})
    if user.deletion_requested_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "deletion.noRequest"},
        )
    if user.deletion_completed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "deletion.alreadyCompleted"},
        )

    bal = await get_user_balance(db, user_id=user.id)
    if bal != Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "deletion.balanceNotZero",
                "balance": str(bal),
                "message": "請先請用戶把餘額提光或內轉出去",
            },
        )

    now = datetime.now(UTC)
    user.status = UserStatus.SUSPENDED.value
    user.email = f"deleted-{user.id}@quiver.deleted"
    user.display_name = None
    user.avatar_url = None
    user.deletion_completed_at = now

    # revoke all sessions
    await db.execute(
        update(LoginSession)
        .where(LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.commit()

    logger.info("admin_completed_deletion", user_id=user.id, completed_at=now.isoformat())
    return ApiResponse[dict].ok({"completed_at": now.isoformat()})
