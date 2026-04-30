"""AuditLog — 系統值得追究的動作流水 (phase 6E-3)。

設計原則:
- append-only:沒有 update / delete API,只新增
- actor_kind:USER / ADMIN / SYSTEM(SYSTEM = cron / webhook)
- action:dot-namespaced,e.g. `kyc.approve`、`withdrawal.reject`、`auth.login`
- payload jsonb:留給每種 action 自己決定要記什麼(理由、舊新值對比…)
- index 在 actor_id / action / (target_kind, target_id) / created_at
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class ActorKind(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class TargetKind(str, enum.Enum):
    USER = "USER"
    KYC = "KYC"
    WITHDRAWAL = "WITHDRAWAL"
    ONCHAIN_TX = "ONCHAIN_TX"
    PLATFORM = "PLATFORM"
    SESSION = "SESSION"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_kind: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[int | None] = mapped_column(BigInteger)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
