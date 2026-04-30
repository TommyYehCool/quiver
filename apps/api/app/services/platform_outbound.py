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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
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
    in_flight_withdrawal_amount: Decimal  # APPROVED/PROCESSING/BROADCASTING 但還沒上鏈的部分
    platform_profit: Decimal  # 真實 profit:扣掉 in-flight 後算
    fee_withdrawal_max: Decimal
    cold_rebalance_max: Decimal
    # 6E-4:COLD 鏈上 USDT(若 cold_wallet_address 設定)
    cold_address: str | None
    cold_usdt_balance: Decimal | None
    # 真正持有 USDT = HOT - 在途 + COLD,跟 user ledger 比才看得出真實獲利
    total_holdings: Decimal


@dataclass
class OutboundResult:
    tx_hash: str
    purpose: OutboundPurpose
    amount: Decimal
    to_address: str


async def compute_quota(db: AsyncSession) -> OutboundQuota:
    """看當前 HOT / ledger 算出可送額度。

    Race-safe: 扣掉「ledger 已扣但 HOT 還沒扣」的提領在途金額,避免 fee-withdraw
    在 race window 看到虛胖的 profit。

    時序問題:
      1. 用戶提領 submit 時,ledger 立刻扣 user(amount+fee)
      2. broadcast worker 跑完前,HOT 鏈上還沒扣 amount
      3. 這段時間 HOT - user_ledger 會虛增 amount(看起來像獲利,實則之後 HOT 會掉)
      4. 計算 profit 時要先把 in-flight amount 扣掉
    """
    hot_addr = await get_platform_hot_wallet_address(db)
    try:
        hot_balance = await tatum.get_trc20_balance(hot_addr, settings.usdt_contract)
    except TatumError as e:
        raise OutboundError(
            "platform.outbound.queryBalanceFailed", http_status=503,
            params={"error": str(e)},
        ) from e
    user_total = await get_total_user_balance(db)

    # 在途的提領 amount(approved 排到 broadcast、broadcasting 等 confirm 都算)
    in_flight_q = await db.execute(
        select(func.coalesce(func.sum(WithdrawalRequest.amount), 0)).where(
            WithdrawalRequest.status.in_([
                WithdrawalStatus.APPROVED.value,
                WithdrawalStatus.PROCESSING.value,
                WithdrawalStatus.BROADCASTING.value,
            ])
        )
    )
    in_flight = Decimal(in_flight_q.scalar_one() or 0)

    # 真正穩定的 profit:HOT 鏈上 - 在途提領 - 用戶 ledger
    # 在途 = 用戶 ledger 已扣但 HOT 還沒扣的部分,所以要先從 HOT 扣掉再比
    profit = hot_balance - in_flight - user_total

    # 6E-4: COLD wallet 鏈上餘額(只讀,系統不存私鑰)
    cold_addr: str | None = settings.cold_wallet_address or None
    cold_balance: Decimal | None = None
    if cold_addr:
        try:
            cold_balance = await tatum.get_trc20_balance(cold_addr, settings.usdt_contract)
        except TatumError as e:
            logger.warning("cold_balance_unavailable", error=str(e))
            cold_balance = None

    # cold_rebalance_max = HOT 高於 target 的可移金額,但不能超過 profit(避免動到用戶資金)
    intent = max(Decimal(0), hot_balance - settings.hot_target_usdt)
    safety = max(Decimal(0), profit)
    cold_max = min(intent, safety)

    # 真正持有 = HOT(扣掉在途的部分,因為那馬上要送出去) + COLD
    held_hot = hot_balance - in_flight
    total_holdings = held_hot + (cold_balance if cold_balance is not None else Decimal(0))

    return OutboundQuota(
        hot_usdt_balance=hot_balance,
        user_balances_total=user_total,
        in_flight_withdrawal_amount=in_flight,
        platform_profit=profit,
        fee_withdrawal_max=max(Decimal(0), profit),
        cold_rebalance_max=cold_max,
        cold_address=cold_addr,
        cold_usdt_balance=cold_balance,
        total_holdings=total_holdings,
    )


def _validate_address(addr: str) -> None:
    if not TRON_ADDR_RE.match(addr):
        raise OutboundError("platform.outbound.invalidAddress")


async def _verify_admin_2fa(db: AsyncSession, *, admin: User, totp_code: str | None) -> None:
    """敏感 admin 操作:強制要求 admin 已啟用 + 必驗 totp_code。

    雙層防護:即使呼叫者忘記用 TwoFAAdminDep dep,service 這層還是會擋下沒開 2FA 的 admin。
    """
    if admin.totp_enabled_at is None:
        raise OutboundError("admin.twofaRequired", http_status=412)
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
