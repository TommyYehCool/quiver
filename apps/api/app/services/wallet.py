"""HD wallet 派生 — 從 master seed 算出每個用戶的 Tron 地址。

派生路徑:m/44'/195'/0'/0/{user_id}
  - 44'   BIP44 標準
  - 195'  Tron(SLIP-44 coin type)
  - 0'    第一個 account
  - 0     external chain(收款用)
  - {user_id}  使用者唯一索引

私鑰**不存 DB**。地址(公開資訊)存 `users.tron_address`,要簽名(Phase 5+)時才即時派生。
"""

from __future__ import annotations

from bip_utils import Bip44, Bip44Changes, Bip44Coins
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.system_keys import SystemKey, SystemKeyState
from app.models.user import User
from app.services.crypto import CryptoError, Envelope, decrypt, kek_from_b64

logger = get_logger(__name__)


class WalletError(Exception):
    """派生失敗(系統未初始化 / master seed 解密失敗等)。"""


async def _load_master_seed(db: AsyncSession) -> bytes:
    """從 DB 讀加密的 master seed,用 env 的 KEK 解密。"""
    result = await db.execute(select(SystemKey).order_by(SystemKey.id.asc()).limit(1))
    row = result.scalar_one_or_none()

    if row is None or row.state != SystemKeyState.INITIALIZED.value:
        raise WalletError("system not initialized — master seed unavailable")
    if row.master_seed_ciphertext is None:
        raise WalletError("master seed ciphertext missing")

    env_kek_b64 = settings.kek_current_b64.get_secret_value()
    if not env_kek_b64:
        raise WalletError("KEK not present in env")

    try:
        kek = kek_from_b64(env_kek_b64)
        envelope = Envelope(key_version=row.key_version, ciphertext_b64=row.master_seed_ciphertext)
        return decrypt(envelope, kek)
    except CryptoError as e:
        raise WalletError(f"master seed decryption failed: {e}") from e


def _derive_tron_address(master_seed: bytes, user_id: int) -> str:
    """純函式 — 給 master seed 和 user_id,回傳 user 的 Tron base58 地址(T 開頭)。

    路徑:m/44'/195'/0'/0/{user_id}
    """
    bip44_mst = Bip44.FromSeed(master_seed, Bip44Coins.TRON)
    addr_ctx = (
        bip44_mst.Purpose()
        .Coin()
        .Account(0)
        .Change(Bip44Changes.CHAIN_EXT)
        .AddressIndex(user_id)
    )
    return addr_ctx.PublicKey().ToAddress()


def _derive_platform_fee_payer_address(master_seed: bytes) -> str:
    """平台 FEE_PAYER 地址 — 跟 user 路徑分開,放在 account index 1。

    路徑:m/44'/195'/1'/0/0(account 1,address 0)
    """
    bip44_mst = Bip44.FromSeed(master_seed, Bip44Coins.TRON)
    addr_ctx = (
        bip44_mst.Purpose()
        .Coin()
        .Account(1)
        .Change(Bip44Changes.CHAIN_EXT)
        .AddressIndex(0)
    )
    return addr_ctx.PublicKey().ToAddress()


async def get_platform_fee_payer_address(db: AsyncSession) -> str:
    """從 master seed 派生 FEE_PAYER 地址。每次呼叫都重新解 + 派生。"""
    master_seed = await _load_master_seed(db)
    try:
        return _derive_platform_fee_payer_address(master_seed)
    finally:
        master_seed = b"\x00" * len(master_seed)  # noqa: F841


def _derive_user_private_key_hex(master_seed: bytes, user_id: int) -> str:
    """派生 user 的 secp256k1 private key,回 hex(無 0x prefix)— 給 Tatum 用。"""
    bip44_mst = Bip44.FromSeed(master_seed, Bip44Coins.TRON)
    addr_ctx = (
        bip44_mst.Purpose()
        .Coin()
        .Account(0)
        .Change(Bip44Changes.CHAIN_EXT)
        .AddressIndex(user_id)
    )
    return addr_ctx.PrivateKey().Raw().ToHex()


def _derive_fee_payer_private_key_hex(master_seed: bytes) -> str:
    """派生 FEE_PAYER 的 secp256k1 private key hex。"""
    bip44_mst = Bip44.FromSeed(master_seed, Bip44Coins.TRON)
    addr_ctx = (
        bip44_mst.Purpose()
        .Coin()
        .Account(1)
        .Change(Bip44Changes.CHAIN_EXT)
        .AddressIndex(0)
    )
    return addr_ctx.PrivateKey().Raw().ToHex()


async def load_user_signing_keys(
    db: AsyncSession, user_id: int
) -> tuple[str, str, str, str]:
    """一次取出簽 transactions 需要的東西:
        (user_address, user_priv_key_hex, fee_payer_address, fee_payer_priv_key_hex)

    用完 caller 應立即從記憶體拋掉(Python 沒有真正的 zero,但變數 reassign 縮短 GC window)。
    """
    master_seed = await _load_master_seed(db)
    try:
        user_addr = _derive_tron_address(master_seed, user_id)
        user_priv = _derive_user_private_key_hex(master_seed, user_id)
        fp_addr = _derive_platform_fee_payer_address(master_seed)
        fp_priv = _derive_fee_payer_private_key_hex(master_seed)
        return user_addr, user_priv, fp_addr, fp_priv
    finally:
        master_seed = b"\x00" * len(master_seed)  # noqa: F841


async def get_or_derive_tron_address(db: AsyncSession, user: User) -> str:
    """如果 user 已有 tron_address 直接回;否則派生 + 寫 DB + 回。"""
    if user.tron_address:
        return user.tron_address

    master_seed = await _load_master_seed(db)
    try:
        address = _derive_tron_address(master_seed, user.id)
    finally:
        # 用完立即抹除 master seed bytes(雖然 GC 不一定立刻收,但盡量縮短記憶體窗口)
        master_seed = b"\x00" * len(master_seed)  # noqa: F841

    user.tron_address = address
    await db.commit()
    await db.refresh(user)

    logger.info("tron_address_derived", user_id=user.id, address=address)

    # Best-effort lazy Tatum subscription:現在就訂,日後 ngrok URL 變了
    # 會由 lifespan / admin 手動 sync 來修正。失敗不影響地址派生。
    try:
        from app.services.subscription import (
            resolve_callback_url,
            sync_user_subscription,
        )

        callback_url = await resolve_callback_url()
        if callback_url:
            await sync_user_subscription(db, user, callback_url)
    except Exception as e:
        logger.warning("tatum_lazy_subscription_failed", user_id=user.id, error=str(e))

    return address
