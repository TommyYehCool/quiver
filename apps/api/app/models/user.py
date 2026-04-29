"""User model — 對應 spec §3 users 表。"""

from __future__ import annotations

import enum

from sqlalchemy import ARRAY, BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    provider: Mapped[str | None] = mapped_column(String(32))
    provider_user_id: Mapped[str | None] = mapped_column(String(255))
    roles: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{USER}"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=UserStatus.ACTIVE.value
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False, server_default="zh-TW")

    @property
    def is_admin(self) -> bool:
        return UserRole.ADMIN.value in self.roles

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE.value
