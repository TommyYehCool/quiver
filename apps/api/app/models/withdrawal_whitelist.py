"""Withdrawal whitelist 地址(phase 6E-2)。

設計:
- activated_at 為**未來**時間 → 還在 24hr 冷靜期,不能用
- activated_at 已過 → 啟用中,可被提領用
- removed_at 有值 → 用戶已移除(soft delete,保留歷史審計)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class WithdrawalWhitelist(Base):
    __tablename__ = "withdrawal_whitelist"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    address: Mapped[str] = mapped_column(String(34), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
