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
    """純函式 — 給 master seed 和 user_id,回傳 Tron base58 地址(T 開頭)。"""
    bip44_mst = Bip44.FromSeed(master_seed, Bip44Coins.TRON)
    addr_ctx = (
        bip44_mst.Purpose()
        .Coin()
        .Account(0)
        .Change(Bip44Changes.CHAIN_EXT)
        .AddressIndex(user_id)
    )
    return addr_ctx.PublicKey().ToAddress()


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
    return address
