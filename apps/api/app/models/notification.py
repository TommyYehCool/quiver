"""In-app 通知 — 用戶 dashboard 上方鈴鐺看的東西。

設計:
- 不存翻譯文字,只存 type + params,前端依 i18n key 渲染
- read_at NULL 代表未讀
- 不會自動清理,phase 6+ 再看是否要 retention(比如 90 天前的丟掉)
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NotificationType(str, enum.Enum):
    DEPOSIT_POSTED = "DEPOSIT_POSTED"
    TRANSFER_RECEIVED = "TRANSFER_RECEIVED"
    KYC_APPROVED = "KYC_APPROVED"
    KYC_REJECTED = "KYC_REJECTED"
    WITHDRAWAL_COMPLETED = "WITHDRAWAL_COMPLETED"
    WITHDRAWAL_FAILED = "WITHDRAWAL_FAILED"
    WITHDRAWAL_REJECTED = "WITHDRAWAL_REJECTED"


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
