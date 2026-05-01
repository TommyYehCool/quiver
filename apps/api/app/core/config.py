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
    tatum_api_key_testnet: SecretStr = SecretStr("")
    tatum_api_key_mainnet: SecretStr = SecretStr("")
    tatum_base_url: str = "https://api.tatum.io"
    webhook_callback_url: str = ""
    webhook_path_token: SecretStr = SecretStr("")

    # ---- USDT TRC20 contract per network ----
    # Tatum webhook 的 `asset` 欄位帶的是合約地址(不是 symbol),所以要用合約對比
    # Mainnet: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (Tether USD)
    # Shasta testnet: TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs (測試版 USDT,Tether 部署的)
    usdt_contract_testnet: str = "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs"
    usdt_contract_mainnet: str = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

    # ---- Resend (Phase 2+) ----
    resend_api_key: SecretStr = SecretStr("")
    resend_from_email: str = "noreply@quiver.local"

    # ---- BitoPro (Phase 6+) ----
    bitopro_base_url: str = "https://api.bitopro.com/v3"

    # ---- Sentry (Phase 6E) ----
    sentry_dsn: str = ""  # 空字串 → Sentry 不啟用
    sentry_traces_sample_rate: float = 0.0
    sentry_release: str = ""  # 通常用 git sha

    # ---- 業務參數 ----
    admin_emails: Annotated[list[EmailStr], NoDecode] = Field(default_factory=list)
    withdrawal_fee_usdt: Decimal = Decimal("1")
    withdrawal_large_threshold_usd: Decimal = Decimal("1000")
    min_withdrawal_usdt: Decimal = Decimal("5")
    reconciliation_tolerance_usdt: Decimal = Decimal("0.01")

    # ---- 6E-2:提領安全 ----
    totp_issuer: str = "Quiver"
    # 白名單地址加入後的冷靜期(小時)
    whitelist_cooldown_hours: int = 24
    # 單日提領上限(超過自動進 PENDING_REVIEW)
    withdrawal_daily_count_limit: int = 3
    withdrawal_daily_amount_limit_usd: Decimal = Decimal("5000")

    # ---- Earn:Bitfinex platform key(可選,空就不能跑 platform 模式)----
    # F-Phase 1 給 Tommy 自己的 internal earn_account 用;
    # 未來 V0.5 commercial 也用同一把(共用 platform float)
    bitfinex_api_key: SecretStr = SecretStr("")
    bitfinex_api_secret: SecretStr = SecretStr("")

    # ---- 6E-4:冷熱錢包架構 ----
    # 你掌控但跟系統分離的 Tron 地址(TronLink、硬體錢包、多簽…),系統只讀,不簽。
    # 空字串 = 未設,/admin/platform 上的 COLD 卡會顯示「未設定」。
    cold_wallet_address: str = ""
    # HOT 鏈上 USDT 超過這個就提醒移到 COLD
    hot_max_usdt: Decimal = Decimal("5000")
    # 移完後 HOT 應該回到的水位(必須 < hot_max_usdt)
    hot_target_usdt: Decimal = Decimal("2000")

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

    @property
    def tatum_api_key(self) -> SecretStr:
        return self.tatum_api_key_mainnet if self.env == "mainnet" else self.tatum_api_key_testnet

    @property
    def usdt_contract(self) -> str:
        return self.usdt_contract_mainnet if self.env == "mainnet" else self.usdt_contract_testnet

    @property
    def totp_display_issuer(self) -> str:
        """掃 QR 後在 Authenticator app 顯示的名字。
        testnet 強制加 "(Dev)" 後綴,避免跟正式環境條目搞混。
        """
        if self.env == "mainnet":
            return self.totp_issuer
        return f"{self.totp_issuer} (Dev)"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
