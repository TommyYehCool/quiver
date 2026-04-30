"""User model — 對應 spec §3 users 表。"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import ARRAY, BigInteger, Boolean, DateTime, SmallInteger, String, Text
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
    tron_address: Mapped[str | None] = mapped_column(String(34), unique=True, index=True)
    tatum_sub_id: Mapped[str | None] = mapped_column(String(64))
    tatum_sub_callback_url: Mapped[str | None] = mapped_column(String(512))

    # phase 6E-1: account deletion (GDPR / 個資法)
    # _requested_at = 用戶提出刪除申請(等 admin 審核)
    # _completed_at = admin 完成刪除(soft delete:status SUSPENDED + email 改為 deleted-{id}@quiver.deleted)
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # phase 6E-5: TOS / Privacy acceptance
    # NULL = 還沒同意,不能用敏感功能(KYC、轉帳、提領)
    # tos_version 用於未來 TOS 改版時讓用戶重新同意
    tos_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tos_version: Mapped[str | None] = mapped_column(String(16))

    # phase 6E-2: 2FA TOTP
    # secret 用 envelope encryption(同 master seed),只存加密後的 b64 + key_version
    # totp_enabled_at = NULL: 還沒設定 / 已 disable;有值: 啟用中
    totp_secret_enc: Mapped[str | None] = mapped_column(Text)
    totp_key_version: Mapped[int | None] = mapped_column(SmallInteger)
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # phase 6E-2: 提領白名單模式
    # True → 只能提到已 activated 的白名單地址
    withdrawal_whitelist_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    @property
    def is_admin(self) -> bool:
        return UserRole.ADMIN.value in self.roles

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE.value
