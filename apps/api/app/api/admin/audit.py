"""Admin: 查詢 audit log(phase 6E-3)。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc, func, select
from sqlalchemy.orm import aliased

from app.api.deps import CurrentAdminDep, DbDep
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.api import ApiResponse

router = APIRouter(prefix="/api/admin/audit", tags=["admin-audit"])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int | None
    actor_email: str | None
    actor_kind: str
    action: str
    target_kind: str | None
    target_id: int | None
    payload: dict[str, Any] | None
    ip: str | None
    user_agent: str | None
    created_at: datetime


class AuditListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int


@router.get("", response_model=ApiResponse[AuditListOut])
async def list_audit_logs(
    _: CurrentAdminDep,
    db: DbDep,
    actor_id: int | None = Query(None),
    action: str | None = Query(None, max_length=64),
    target_kind: str | None = Query(None, max_length=32),
    target_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> ApiResponse[AuditListOut]:
    """列出 audit log,可依 actor / action / target 篩。

    回傳依 created_at 降冪(最新在前)。
    """
    actor_alias = aliased(User)
    base_q = select(AuditLog, actor_alias.email).outerjoin(
        actor_alias, AuditLog.actor_id == actor_alias.id
    )
    count_q = select(func.count()).select_from(AuditLog)
    where: list[Any] = []
    if actor_id is not None:
        where.append(AuditLog.actor_id == actor_id)
    if action:
        where.append(AuditLog.action == action)
    if target_kind:
        where.append(AuditLog.target_kind == target_kind)
    if target_id is not None:
        where.append(AuditLog.target_id == target_id)
    if where:
        base_q = base_q.where(*where)
        count_q = count_q.where(*where)

    total = (await db.execute(count_q)).scalar_one()

    rows_q = base_q.order_by(desc(AuditLog.created_at)).limit(page_size).offset((page - 1) * page_size)
    rows = (await db.execute(rows_q)).all()

    items = [
        AuditLogOut(
            id=log.id,
            actor_id=log.actor_id,
            actor_email=email,
            actor_kind=log.actor_kind,
            action=log.action,
            target_kind=log.target_kind,
            target_id=log.target_id,
            payload=log.payload,
            ip=log.ip,
            user_agent=log.user_agent,
            created_at=log.created_at,
        )
        for log, email in rows
    ]

    return ApiResponse[AuditListOut].ok(
        AuditListOut(items=items, total=total, page=page, page_size=page_size)
    )
