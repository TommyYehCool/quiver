"""Audit log service — phase 6E-3。

集中所有 audit 寫入,讓 endpoint 程式碼乾淨。

Conventions:
- action 命名:`<scope>.<verb>`,e.g. `kyc.approve`, `withdrawal.reject`
- payload 不存敏感資料(密碼、token、KYC 照片 URL 等)
- 失敗的審核 / 操作也要記(reject、force-fail)
- read-only 動作通常不記,除非很敏感(看 KYC 照片之類)
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import ActorKind, AuditLog
from app.models.user import User, UserRole


async def write_audit(
    db: AsyncSession,
    *,
    actor: User | None,
    action: str,
    target_kind: str | None = None,
    target_id: int | None = None,
    payload: dict[str, Any] | None = None,
    request: Request | None = None,
    actor_kind_override: ActorKind | None = None,
) -> AuditLog:
    """寫一筆 audit log。

    - actor=None 視為 SYSTEM(cron / webhook)
    - actor 是 admin 自動設 ADMIN,否則 USER(可用 actor_kind_override 覆寫)
    - request 帶進來會自動抓 ip + user_agent
    """
    if actor is None:
        actor_kind = ActorKind.SYSTEM
        actor_id: int | None = None
    elif actor_kind_override is not None:
        actor_kind = actor_kind_override
        actor_id = actor.id
    elif UserRole.ADMIN.value in actor.roles:
        actor_kind = ActorKind.ADMIN
        actor_id = actor.id
    else:
        actor_kind = ActorKind.USER
        actor_id = actor.id

    ip: str | None = None
    ua: str | None = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")

    log = AuditLog(
        actor_id=actor_id,
        actor_kind=actor_kind.value,
        action=action,
        target_kind=target_kind,
        target_id=target_id,
        payload=payload,
        ip=ip,
        user_agent=ua,
    )
    db.add(log)
    await db.flush()  # 拿到 id,但 commit 由呼叫方控制(隨同主動作的 transaction)
    return log
