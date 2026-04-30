"""TOTP(RFC 6238)+ 一次性 backup codes(phase 6E-2)。

Secret 加密儲存:用 envelope encryption(同 master seed),只暴露 base32 給前端
讓 Google Authenticator 之類的 app 設定。

Backup codes:8 個 8-digit string,只存 sha256(code) hash;用過就標 used_at。
"""

from __future__ import annotations

import hashlib
import secrets
from urllib.parse import quote

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.system_keys import SystemKey, SystemKeyState
from app.models.totp_backup_code import TotpBackupCode
from app.services import crypto

logger = get_logger(__name__)

BACKUP_CODE_COUNT = 8
BACKUP_CODE_LEN = 8  # 數字 8 位


# ---------- KEK 取用(同 wallet) ----------


async def _load_kek(db: AsyncSession) -> bytes:
    """讀 INITIALIZED 的 SystemKey 並用 env 的 KEK 對 hash check 過。"""
    q = await db.execute(
        select(SystemKey).where(SystemKey.state == SystemKeyState.INITIALIZED.value).limit(1)
    )
    row = q.scalar_one_or_none()
    if row is None:
        raise crypto.CryptoError("system not initialized")
    env_b64 = settings.kek_current_b64.get_secret_value()
    if not env_b64:
        raise crypto.CryptoError("KEK_CURRENT_B64 missing")
    kek = crypto.kek_from_b64(env_b64)
    if crypto.kek_hash(kek) != row.kek_hash:
        raise crypto.CryptoError("KEK hash mismatch")
    return kek


# ---------- secret 產生 / 取用 ----------


def generate_secret() -> str:
    """產一個 base32 TOTP secret(20 bytes 隨機,base32 encode 32 chars)。"""
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_email: str) -> str:
    """產 otpauth:// URI 給用戶用 Authenticator app 掃 QR。"""
    issuer = quote(settings.totp_issuer)
    label = quote(f"{settings.totp_issuer}:{account_email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


async def encrypt_and_store_secret(
    db: AsyncSession, *, user_id: int, secret: str
) -> tuple[str, int]:
    """加密 secret,回傳 (ciphertext_b64, key_version) 讓 caller 寫到 user 上。"""
    kek = await _load_kek(db)
    try:
        env = crypto.encrypt(secret.encode("utf-8"), kek)
    finally:
        # 清掉 KEK
        kek = b"\x00" * len(kek)
    return env.ciphertext_b64, env.key_version


async def decrypt_user_secret(
    db: AsyncSession, *, ciphertext_b64: str, key_version: int
) -> str:
    """從 user.totp_secret_enc + key_version 還原 secret。"""
    kek = await _load_kek(db)
    try:
        env = crypto.Envelope(key_version=key_version, ciphertext_b64=ciphertext_b64)
        plain = crypto.decrypt(env, kek)
    finally:
        kek = b"\x00" * len(kek)
    return plain.decode("utf-8")


# ---------- code 驗證 ----------


def verify_code(secret: str, code: str) -> bool:
    """用 ±1 window(30s ± 30s)避免時鐘小誤差被 reject。"""
    if not code or not code.isdigit() or len(code) != 6:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# ---------- backup codes ----------


def _hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _format_code(c: str) -> str:
    """8 位數中間插一個橫槓比較好讀:`1234-5678`。"""
    return f"{c[:4]}-{c[4:]}"


def _strip_code(c: str) -> str:
    """input 接受帶橫槓或不帶。"""
    return c.replace("-", "").replace(" ", "").strip()


def generate_backup_codes() -> list[str]:
    """產 8 個 8-digit codes(以 dash 分隔),呼叫方負責顯示給用戶 + hash 寫 DB。"""
    codes: list[str] = []
    for _ in range(BACKUP_CODE_COUNT):
        n = secrets.randbelow(10**BACKUP_CODE_LEN)
        codes.append(_format_code(f"{n:0{BACKUP_CODE_LEN}d}"))
    return codes


async def store_backup_codes(
    db: AsyncSession, *, user_id: int, codes: list[str]
) -> None:
    """code 進來時是 'xxxx-xxxx',hash 不帶 dash 的 normalized 形式。"""
    for raw in codes:
        db.add(
            TotpBackupCode(
                user_id=user_id, code_hash=_hash_backup_code(_strip_code(raw))
            )
        )


async def consume_backup_code(
    db: AsyncSession, *, user_id: int, code: str
) -> bool:
    """嘗試用一個 backup code 通過驗證,通過 → 標 used_at,後續就不能用。"""
    h = _hash_backup_code(_strip_code(code))
    q = await db.execute(
        select(TotpBackupCode).where(
            TotpBackupCode.user_id == user_id,
            TotpBackupCode.code_hash == h,
            TotpBackupCode.used_at.is_(None),
        )
    )
    row = q.scalar_one_or_none()
    if row is None:
        return False
    from datetime import UTC, datetime

    row.used_at = datetime.now(UTC)
    return True


async def count_unused_backup_codes(db: AsyncSession, *, user_id: int) -> int:
    from sqlalchemy import func

    q = await db.execute(
        select(func.count())
        .select_from(TotpBackupCode)
        .where(
            TotpBackupCode.user_id == user_id,
            TotpBackupCode.used_at.is_(None),
        )
    )
    return q.scalar_one()
