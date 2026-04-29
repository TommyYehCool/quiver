"""Pydantic Settings — 從環境變數讀取所有設定。"""

from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import EmailStr, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- runtime ----
    env: Literal["testnet", "mainnet"] = "testnet"
    tz: str = "Asia/Taipei"

    # ---- 服務 URL ----
    api_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"

    # ---- DB ----
    database_url: str

    # ---- Redis ----
    redis_url: str = "redis://redis:6379/0"

    # ---- JWT ----
    jwt_secret: SecretStr
    jwt_expires_seconds: int = 86400
    jwt_algorithm: str = "HS256"

    # ---- KEK (Phase 3+) ----
    kek_current_b64: SecretStr = SecretStr("")

    # ---- Google OAuth ----
    google_client_id: SecretStr
    google_client_secret: SecretStr

    # ---- Tatum (Phase 3+) ----
    tatum_api_key: SecretStr = SecretStr("")
    tatum_base_url: str = "https://api.tatum.io"
    webhook_callback_url: str = ""
    webhook_path_token: SecretStr = SecretStr("")

    # ---- Resend (Phase 2+) ----
    resend_api_key: SecretStr = SecretStr("")
    resend_from_email: str = "noreply@quiver.local"

    # ---- BitoPro (Phase 6+) ----
    bitopro_base_url: str = "https://api.bitopro.com/v3"

    # ---- 業務參數 ----
    admin_emails: Annotated[list[EmailStr], NoDecode] = Field(default_factory=list)
    withdrawal_fee_usdt: Decimal = Decimal("1")
    withdrawal_large_threshold_usd: Decimal = Decimal("1000")
    min_withdrawal_usdt: Decimal = Decimal("5")
    reconciliation_tolerance_usdt: Decimal = Decimal("0.01")

    @field_validator("admin_emails", mode="before")
    @classmethod
    def parse_admin_emails(cls, v: object) -> object:
        if isinstance(v, str):
            return [email.strip() for email in v.split(",") if email.strip()]
        return v

    @property
    def is_dev(self) -> bool:
        return self.env == "testnet"

    @property
    def cookie_secure(self) -> bool:
        return self.frontend_base_url.startswith("https://")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
