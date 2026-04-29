"""System keys — KEK metadata + 加密 master seed。

只一筆 row(`id=1`),代表整個系統的金鑰狀態:
- `state`: AWAITING_VERIFY → INITIALIZED
- `kek_hash`: KEK 的 SHA-256(用於 lifespan 驗證 env 中的 KEK 沒被換掉)
- `master_seed_ciphertext`: master seed 用 KEK 加密後的 envelope blob (base64)
- `key_version`: 為將來 KEK rotation 預留
"""

from __future__ import annotations

import enum

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SystemKeyState(str, enum.Enum):
    AWAITING_VERIFY = "AWAITING_VERIFY"
    INITIALIZED = "INITIALIZED"


class SystemKey(Base, TimestampMixin):
    __tablename__ = "system_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    kek_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    master_seed_ciphertext: Mapped[str | None] = mapped_column(String, nullable=True)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
