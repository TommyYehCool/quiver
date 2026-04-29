"""KYC submission model — 對應 spec §3 kyc_submissions 表。"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class KycStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class KycSubmission(Base, TimestampMixin):
    __tablename__ = "kyc_submissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    legal_name: Mapped[str | None] = mapped_column(String(255))
    id_number: Mapped[str | None] = mapped_column(String(64))
    birth_date: Mapped[date | None] = mapped_column(Date)
    country: Mapped[str | None] = mapped_column(String(2))

    id_front_url: Mapped[str | None] = mapped_column(String(1024))
    id_back_url: Mapped[str | None] = mapped_column(String(1024))
    selfie_url: Mapped[str | None] = mapped_column(String(1024))
    proof_of_address_url: Mapped[str | None] = mapped_column(String(1024))

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=KycStatus.PENDING.value, index=True
    )
    reject_reason: Mapped[str | None] = mapped_column(String(1024))
    reviewed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
