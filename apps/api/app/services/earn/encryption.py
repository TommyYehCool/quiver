"""Bitfinex API key 加密 — 跟 TOTP 同走 envelope encryption (KEK)。

抽出共用 helper,讓 earn API endpoint / cron / adapter 都用同一套。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.system_keys import SystemKey, SystemKeyState
from app.services import crypto


async def _load_kek(db: AsyncSession) -> bytes:
    """讀 INITIALIZED SystemKey 並用 env KEK 對 hash check(同 totp._load_kek)。"""
    q = await db.execute(
        select(SystemKey).where(
            SystemKey.state == SystemKeyState.INITIALIZED.value
        ).limit(1)
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


async def encrypt_bitfinex_key(
    db: AsyncSession, *, plaintext: str
) -> tuple[str, int]:
    """加密一個 Bitfinex API key 或 secret,回傳 (ciphertext_b64, key_version)。"""
    kek = await _load_kek(db)
    try:
        env = crypto.encrypt(plaintext.encode("utf-8"), kek)
    finally:
        kek = b"\x00" * len(kek)
    return env.ciphertext_b64, env.key_version


async def decrypt_bitfinex_key(
    db: AsyncSession, *, ciphertext_b64: str, key_version: int
) -> str:
    """解 Bitfinex API key / secret 回明文。"""
    kek = await _load_kek(db)
    try:
        env = crypto.Envelope(
            key_version=key_version, ciphertext_b64=ciphertext_b64
        )
        plain = crypto.decrypt(env, kek)
    finally:
        kek = b"\x00" * len(kek)
    return plain.decode("utf-8")
