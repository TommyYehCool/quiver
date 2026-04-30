"""平台主動發起的對外 USDT 轉帳(phase 6E-2.5)。

跟用戶提領的差別:
- 不動 ledger(平台用的不是用戶帳戶)
- 沒有 admin review(本身就是 admin 操作)
- 來源 = HOT,跟用戶提領一樣

Purpose:
- FEE_WITHDRAWAL — 把累計手續費提到營運者錢包(現在有)
- COLD_REBALANCE — HOT 超過上限轉到 COLD(phase 6E-4 加)

兩個 purpose 共用 send_platform_outbound(),只差「最大可送金額」的計算規則:
- FEE_WITHDRAWAL: ≤ platform_profit (HOT 鏈上 USDT − 全用戶 ledger 餘額)
- COLD_REBALANCE: ≤ HOT 鏈上 USDT − HOT_TARGET_USDT (留 buffer)

故意 sync 跑(top-up + send,~15s 阻塞),admin 操作而已不需要 worker 派發。
"""

from __future__ import annotations

import asyncio
import enum
import re
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.services import tatum, totp as totp_svc
from app.services.ledger import get_total_user_balance
from app.services.tatum import TatumError
from app.services.wallet import get_platform_hot_wallet_address, load_hot_signing_keys

logger = get_logger(__name__)

# 跟提領一致 — HOT 至少要有這麼多 TRX 才能送 USDT
PLATFORM_OUTBOUND_TRX_BUDGET = Decimal("30")
TRON_ADDR_RE = re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$")


class OutboundPurpose(str, enum.Enum):
    FEE_WITHDRAWAL = "FEE_WITHDRAWAL"
    COLD_REBALANCE = "COLD_REBALANCE"  # phase 6E-4 才會啟用


class OutboundError(Exception):
    """平台 outbound 失敗,code 會被 endpoint 翻成 i18n。"""

    def __init__(self, code: str, http_status: int = 400, params: dict | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.http_status = http_status
        self.params = params or {}


@dataclass
class OutboundQuota:
    hot_usdt_balance: Decimal
    user_balances_total: Decimal
    platform_profit: Decimal
    fee_withdrawal_max: Decimal
    cold_rebalance_max: Decimal  # phase 6E-4 用,目前等於 platform_profit


@dataclass
class OutboundResult:
    tx_hash: str
    purpose: OutboundPurpose
    amount: Decimal
    to_address: str


async def compute_quota(db: AsyncSession) -> OutboundQuota:
    """看當前 HOT / ledger 算出可送額度。"""
    hot_addr = await get_platform_hot_wallet_address(db)
    try:
        hot_balance = await tatum.get_trc20_balance(hot_addr, settings.usdt_contract)
    except TatumError as e:
        raise OutboundError(
            "platform.outbound.queryBalanceFailed", http_status=503,
            params={"error": str(e)},
        ) from e
    user_total = await get_total_user_balance(db)
    profit = hot_balance - user_total
    # COLD rebalance 的上限以後 phase 6E-4 設定 HOT_TARGET_USDT 後再改
    cold_max = max(Decimal(0), profit)  # 保守起見先等於獲利
    return OutboundQuota(
        hot_usdt_balance=hot_balance,
        user_balances_total=user_total,
        platform_profit=profit,
        fee_withdrawal_max=max(Decimal(0), profit),
        cold_rebalance_max=cold_max,
    )


def _validate_address(addr: str) -> None:
    if not TRON_ADDR_RE.match(addr):
        raise OutboundError("platform.outbound.invalidAddress")


async def _verify_admin_2fa(db: AsyncSession, *, admin: User, totp_code: str | None) -> None:
    """admin 有開 2FA 就強制驗。"""
    if admin.totp_enabled_at is None:
        return
    if not totp_code:
        raise OutboundError("platform.outbound.twofaRequired")
    secret = await totp_svc.decrypt_user_secret(
        db,
        ciphertext_b64=admin.totp_secret_enc or "",
        key_version=admin.totp_key_version or 1,
    )
    ok = totp_svc.verify_code(secret, totp_code)
    if not ok:
        ok = await totp_svc.consume_backup_code(db, user_id=admin.id, code=totp_code)
    if not ok:
        raise OutboundError("twofa.invalidCode")


async def send_platform_outbound(
    db: AsyncSession,
    *,
    admin: User,
    purpose: OutboundPurpose,
    to_address: str,
    amount: Decimal,
    totp_code: str | None,
) -> OutboundResult:
    """從 HOT 送 USDT 到指定地址。

    流程(同 broadcast_withdrawal,但純同步,無 worker):
      1. 驗 admin 2FA(若有開)
      2. 算當前 quota,驗 amount 沒超過 purpose 對應的 max
      3. 拿 HOT + FEE_PAYER keys
      4. HOT TRX top-up if needed → sleep 12s 等上鏈
      5. send_trc20(HOT → to_address)
      6. 回 tx_hash
    """
    if amount <= 0:
        raise OutboundError("platform.outbound.amountMustBePositive")
    _validate_address(to_address)

    await _verify_admin_2fa(db, admin=admin, totp_code=totp_code)

    quota = await compute_quota(db)
    max_amount = (
        quota.fee_withdrawal_max
        if purpose == OutboundPurpose.FEE_WITHDRAWAL
        else quota.cold_rebalance_max
    )
    if amount > max_amount:
        raise OutboundError(
            "platform.outbound.exceedsQuota",
            params={"max": str(max_amount), "requested": str(amount)},
        )

    # 拿 keys + 簽
    hot_addr, hot_priv, fp_addr, fp_priv = await load_hot_signing_keys(db)
    try:
        # TRX top-up
        try:
            hot_trx = await tatum.get_trx_balance(hot_addr)
        except TatumError as e:
            raise OutboundError(
                "platform.outbound.queryBalanceFailed", http_status=503,
                params={"error": str(e)},
            ) from e

        if hot_trx < PLATFORM_OUTBOUND_TRX_BUDGET:
            top_up = PLATFORM_OUTBOUND_TRX_BUDGET - hot_trx
            logger.info(
                "platform_outbound_trx_top_up",
                hot_addr=hot_addr, from_balance=str(hot_trx), top_up=str(top_up),
            )
            try:
                top_up_hash = await tatum.send_trx(fp_priv, hot_addr, top_up)
            except TatumError as e:
                raise OutboundError("platform.outbound.topUpFailed", http_status=503) from e
            logger.info("platform_outbound_trx_top_up_broadcast", tx=top_up_hash)
            await asyncio.sleep(12)

        try:
            tx_hash = await tatum.send_trc20(
                hot_priv, to_address, settings.usdt_contract, amount, fee_limit_trx=100
            )
        except TatumError as e:
            raise OutboundError("platform.outbound.sendFailed", http_status=502) from e
    finally:
        # 縮短 priv key 在記憶體的時間
        hot_priv = "0" * 64  # noqa: F841
        fp_priv = "0" * 64  # noqa: F841

    logger.info(
        "platform_outbound_done",
        purpose=purpose.value,
        amount=str(amount),
        to=to_address,
        tx_hash=tx_hash,
        admin_id=admin.id,
    )
    return OutboundResult(
        tx_hash=tx_hash, purpose=purpose, amount=amount, to_address=to_address
    )
