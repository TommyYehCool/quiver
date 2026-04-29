"""Envelope encryption — AES-256-GCM。

兩層架構:
- KEK (Key Encryption Key): 32-byte master key,**不存 DB**,只存 .env
- DEK (Data Encryption Key): 32-byte 隨機 key,每次加密產生新的,用 KEK 加密後與 ciphertext 一起存

加密格式 (binary, base64-encoded for storage):
  [12-byte nonce_kek] [16-byte tag_kek + len(48) wrapped_dek] [12-byte nonce_data] [ciphertext + 16-byte tag_data]
  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  KEK 包 DEK (固定 76 bytes 含 nonce+ciphertext+tag)              DEK 包 plaintext (variable)

`key_version` 與 ciphertext 一起存 DB(不在這裡的 blob 裡),為未來 KEK rotation 留位。
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Final

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_LEN: Final[int] = 32  # AES-256
NONCE_LEN: Final[int] = 12  # GCM 推薦
DEK_BLOB_LEN: Final[int] = NONCE_LEN + KEY_LEN + 16  # nonce + DEK ciphertext + GCM tag = 60


class CryptoError(Exception):
    """加解密失敗(格式錯誤、KEK 不對、tag 驗證失敗等)。"""


def generate_kek() -> bytes:
    """產生 32-byte 隨機 KEK。"""
    return secrets.token_bytes(KEY_LEN)


def kek_to_b64(kek: bytes) -> str:
    return base64.b64encode(kek).decode("ascii")


def kek_from_b64(s: str) -> bytes:
    raw = base64.b64decode(s, validate=True)
    if len(raw) != KEY_LEN:
        raise CryptoError(f"KEK length must be {KEY_LEN} bytes, got {len(raw)}")
    return raw


def kek_hash(kek: bytes) -> str:
    """SHA-256 hash for verification(不會反推 KEK)。"""
    return hashlib.sha256(kek).hexdigest()


@dataclass(frozen=True)
class Envelope:
    """加密後的資料封包。

    `key_version` 跟 `ciphertext_b64` 一起存 DB,讓 KEK rotation 可知用哪一把 KEK。
    """

    key_version: int
    ciphertext_b64: str


def encrypt(plaintext: bytes, kek: bytes, *, key_version: int = 1) -> Envelope:
    """產生新 DEK → 加密 plaintext → 用 KEK 加密 DEK → 拼成 blob。"""
    if len(kek) != KEY_LEN:
        raise CryptoError("KEK length invalid")

    dek = secrets.token_bytes(KEY_LEN)
    nonce_data = secrets.token_bytes(NONCE_LEN)
    nonce_kek = secrets.token_bytes(NONCE_LEN)

    data_blob = AESGCM(dek).encrypt(nonce_data, plaintext, associated_data=None)
    wrapped_dek = AESGCM(kek).encrypt(nonce_kek, dek, associated_data=None)

    blob = nonce_kek + wrapped_dek + nonce_data + data_blob
    return Envelope(key_version=key_version, ciphertext_b64=base64.b64encode(blob).decode("ascii"))


def decrypt(envelope: Envelope, kek: bytes) -> bytes:
    """從 blob 拆出 DEK → 解 plaintext。"""
    if len(kek) != KEY_LEN:
        raise CryptoError("KEK length invalid")

    blob = base64.b64decode(envelope.ciphertext_b64, validate=True)
    if len(blob) < DEK_BLOB_LEN + NONCE_LEN:
        raise CryptoError("envelope blob too short")

    nonce_kek = blob[:NONCE_LEN]
    wrapped_dek = blob[NONCE_LEN : NONCE_LEN + KEY_LEN + 16]
    nonce_data = blob[NONCE_LEN + KEY_LEN + 16 : NONCE_LEN + KEY_LEN + 16 + NONCE_LEN]
    data_blob = blob[NONCE_LEN + KEY_LEN + 16 + NONCE_LEN :]

    try:
        dek = AESGCM(kek).decrypt(nonce_kek, wrapped_dek, associated_data=None)
        plaintext = AESGCM(dek).decrypt(nonce_data, data_blob, associated_data=None)
    except Exception as e:  # InvalidTag etc.
        raise CryptoError("decryption failed (KEK mismatch or corrupted ciphertext)") from e
    return plaintext
