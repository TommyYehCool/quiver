"""Ledger service — 雙複式記帳 atomic operations。

Phase 3 只有一個 op:`post_deposit` — 把 PROVISIONAL 的 onchain_tx 升 POSTED 並寫入 ledger。
Phase 4+ 會擴充 transfer / withdrawal。
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.ledger import (
    Account,
    AccountKind,
    EntryDirection,
    LedgerEntry,
    LedgerTransaction,
    LedgerTxStatus,
    LedgerTxType,
)
from app.models.onchain_tx import OnchainTx, OnchainTxStatus

logger = get_logger(__name__)

CURRENCY = "USDT-TRC20"


class LedgerError(Exception):
    pass


async def get_or_create_user_account(
    db: AsyncSession, user_id: int, currency: str = CURRENCY
) -> Account:
    """確保 user 有對應的 USER account,沒有就建一個。"""
    result = await db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.kind == AccountKind.USER.value,
            Account.currency == currency,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        account = Account(user_id=user_id, kind=AccountKind.USER.value, currency=currency)
        db.add(account)
        await db.flush()
    return account


async def _platform_custody_account(db: AsyncSession, currency: str = CURRENCY) -> Account:
    result = await db.execute(
        select(Account).where(
            Account.user_id.is_(None),
            Account.kind == AccountKind.PLATFORM_CUSTODY.value,
            Account.currency == currency,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise LedgerError(
            "PLATFORM_CUSTODY account not seeded — alembic migration 0004 should create it"
        )
    return account


async def _platform_fee_revenue_account(
    db: AsyncSession, currency: str = CURRENCY
) -> Account:
    """The CR side of EARN_PERF_FEE / DR side of REFERRAL_PAYOUT (F-4b)."""
    result = await db.execute(
        select(Account).where(
            Account.user_id.is_(None),
            Account.kind == AccountKind.PLATFORM_FEE_REVENUE.value,
            Account.currency == currency,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise LedgerError(
            "PLATFORM_FEE_REVENUE account not seeded — alembic migration 0015 should create it"
        )
    return account


async def post_deposit(db: AsyncSession, onchain_tx: OnchainTx) -> LedgerTransaction:
    """把 PROVISIONAL onchain_tx 升 POSTED 並寫入 ledger(雙複式)。

    DR  PLATFORM_CUSTODY  +amount    ← 我們在鏈上實際保管的資產增加
    CR  USER              +amount    ← 用戶對該資產的請求權

    冪等:如果這筆 onchain_tx 已經有對應 ledger_transaction,直接回那筆。
    """
    if onchain_tx.status == OnchainTxStatus.POSTED.value:
        existing_result = await db.execute(
            select(LedgerTransaction).where(LedgerTransaction.onchain_tx_id == onchain_tx.id)
        )
        existing = existing_result.scalar_one_or_none()
        if existing is not None:
            return existing
        # 不應該發生 — POSTED 但沒 ledger,raise 給人工檢查
        raise LedgerError(f"onchain_tx {onchain_tx.id} is POSTED but no ledger row exists")

    if onchain_tx.status != OnchainTxStatus.PROVISIONAL.value:
        raise LedgerError(
            f"cannot post onchain_tx {onchain_tx.id} from status {onchain_tx.status}"
        )

    user_acct = await get_or_create_user_account(db, onchain_tx.user_id, onchain_tx.currency)
    custody_acct = await _platform_custody_account(db, onchain_tx.currency)

    ledger_tx = LedgerTransaction(
        type=LedgerTxType.DEPOSIT.value,
        status=LedgerTxStatus.POSTED.value,
        onchain_tx_id=onchain_tx.id,
        amount=onchain_tx.amount,
        currency=onchain_tx.currency,
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=custody_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=onchain_tx.amount,
                currency=onchain_tx.currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=user_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=onchain_tx.amount,
                currency=onchain_tx.currency,
            ),
        ]
    )

    onchain_tx.status = OnchainTxStatus.POSTED.value
    onchain_tx.posted_at = datetime.now(timezone.utc)

    # 通知
    from app.models.notification import NotificationType
    from app.services.notifications import create_notification

    create_notification(
        db,
        onchain_tx.user_id,
        NotificationType.DEPOSIT_POSTED,
        params={
            "amount": str(onchain_tx.amount),
            "currency": onchain_tx.currency,
            "tx_hash": onchain_tx.tx_hash,
        },
    )

    await db.commit()
    await db.refresh(ledger_tx)
    logger.info(
        "deposit_posted",
        onchain_tx_id=onchain_tx.id,
        ledger_tx_id=ledger_tx.id,
        user_id=onchain_tx.user_id,
        amount=str(onchain_tx.amount),
    )
    return ledger_tx


async def post_earn_outbound(
    db: AsyncSession,
    *,
    user_id: int,
    amount: Decimal,
    currency: str = CURRENCY,
) -> LedgerTransaction:
    """記錄「USDT 從 Quiver HOT 送到 user 的外部 Bitfinex」事件。

    DR  USER              +amount    ← 用戶對 Quiver 的請求權減少(錢已送出去到他自己 Bitfinex)
    CR  PLATFORM_CUSTODY  +amount    ← Quiver 在鏈上的保管池減少

    這個 entry 跟 DEPOSIT 方向相反 — DEPOSIT 是錢進來增加雙邊,EARN_OUTBOUND
    是錢出去減少雙邊。caller 須在 broadcast 成功後 atomically 跟 earn_position
    狀態更新一起 commit。

    冪等性由 caller 控制(透過 earn_positions 唯一性);此 fn 自己不檢查重複。
    """
    if amount <= 0:
        raise LedgerError(f"earn_outbound amount must be positive, got {amount}")

    user_acct = await get_or_create_user_account(db, user_id, currency)
    custody_acct = await _platform_custody_account(db, currency)

    ledger_tx = LedgerTransaction(
        type=LedgerTxType.EARN_OUTBOUND.value,
        status=LedgerTxStatus.POSTED.value,
        amount=amount,
        currency=currency,
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=user_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=amount,
                currency=currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=custody_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=amount,
                currency=currency,
            ),
        ]
    )

    logger.info(
        "earn_outbound_posted",
        ledger_tx_id=ledger_tx.id,
        user_id=user_id,
        amount=str(amount),
    )
    return ledger_tx


async def balance_for_account(db: AsyncSession, account_id: int) -> Decimal:
    """sum(credit) - sum(debit) for one account。供 transfer / withdrawal 鎖定後計算用。"""
    credits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id == account_id,
            LedgerEntry.direction == EntryDirection.CREDIT.value,
        )
    )
    debits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id == account_id,
            LedgerEntry.direction == EntryDirection.DEBIT.value,
        )
    )
    return Decimal(credits_q.scalar_one() or 0) - Decimal(debits_q.scalar_one() or 0)


async def get_user_balance(
    db: AsyncSession, user_id: int, currency: str = CURRENCY
) -> Decimal:
    """sum(credits) - sum(debits) 對 user 的 account。

    Phase 3 沒有 debit 用戶的場景(沒提領、沒轉出),所以實質上 = sum(credits)。
    """
    result = await db.execute(
        select(Account.id).where(
            Account.user_id == user_id,
            Account.kind == AccountKind.USER.value,
            Account.currency == currency,
        )
    )
    account_id = result.scalar_one_or_none()
    if account_id is None:
        return Decimal("0")

    credits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id == account_id,
            LedgerEntry.direction == EntryDirection.CREDIT.value,
        )
    )
    debits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id == account_id,
            LedgerEntry.direction == EntryDirection.DEBIT.value,
        )
    )
    credits = credits_q.scalar_one() or Decimal("0")
    debits = debits_q.scalar_one() or Decimal("0")
    return Decimal(credits) - Decimal(debits)


async def get_total_user_balance(db: AsyncSession, currency: str = CURRENCY) -> Decimal:
    """所有 USER 帳戶的 ledger 餘額總和(sum(CR) - sum(DR))。

    用於 admin 對帳:HOT 鏈上 USDT - 此值 = 平台累計收的手續費。
    """
    user_acct_ids_q = await db.execute(
        select(Account.id).where(
            Account.kind == AccountKind.USER.value,
            Account.currency == currency,
        )
    )
    user_acct_ids = [r[0] for r in user_acct_ids_q.all()]
    if not user_acct_ids:
        return Decimal("0")

    credits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id.in_(user_acct_ids),
            LedgerEntry.direction == EntryDirection.CREDIT.value,
        )
    )
    debits_q = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.account_id.in_(user_acct_ids),
            LedgerEntry.direction == EntryDirection.DEBIT.value,
        )
    )
    return Decimal(credits_q.scalar_one() or 0) - Decimal(debits_q.scalar_one() or 0)


async def get_pending_amount(
    db: AsyncSession, user_id: int, currency: str = CURRENCY
) -> Decimal:
    """還在 PROVISIONAL 的入金總額(處理中,還不能動用)。"""
    result = await db.execute(
        select(func.coalesce(func.sum(OnchainTx.amount), 0)).where(
            OnchainTx.user_id == user_id,
            OnchainTx.currency == currency,
            OnchainTx.status == OnchainTxStatus.PROVISIONAL.value,
        )
    )
    return Decimal(result.scalar_one() or 0)


# ─────────────────────────────────────────────────────────
# F-4b: perf_fee 收取 + referral 撥款 (Path A)
# ─────────────────────────────────────────────────────────


async def post_perf_fee(
    db: AsyncSession,
    *,
    user_id: int,
    amount: Decimal,
    currency: str = CURRENCY,
) -> LedgerTransaction:
    """從 user 的 Quiver wallet 收 perf_fee。

    DR USER (請求權減少 amount)
    CR PLATFORM_FEE_REVENUE (Quiver 收入增加 amount)

    Caller 須先確認 user 餘額足夠;此 fn 會直接寫(不檢查 insufficient)。
    """
    if amount <= 0:
        raise LedgerError(f"perf_fee amount must be positive, got {amount}")

    user_acct = await get_or_create_user_account(db, user_id, currency)
    fee_revenue_acct = await _platform_fee_revenue_account(db, currency)

    ledger_tx = LedgerTransaction(
        type=LedgerTxType.EARN_PERF_FEE.value,
        status=LedgerTxStatus.POSTED.value,
        amount=amount,
        currency=currency,
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=user_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=amount,
                currency=currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=fee_revenue_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=amount,
                currency=currency,
            ),
        ]
    )

    logger.info(
        "perf_fee_posted",
        ledger_tx_id=ledger_tx.id,
        user_id=user_id,
        amount=str(amount),
    )
    return ledger_tx


async def post_referral_payout(
    db: AsyncSession,
    *,
    referrer_user_id: int,
    amount: Decimal,
    currency: str = CURRENCY,
) -> LedgerTransaction:
    """把 perf_fee 的 X% 從 PLATFORM_FEE_REVENUE 撥給 L1/L2 referrer 主錢包。

    DR PLATFORM_FEE_REVENUE (Quiver 收入減少 amount)
    CR USER(referrer) (請求權增加 amount)

    Caller 負責計算 amount 跟 idempotency(透過 referral_payouts 表的 unique
    constraint 保證同一 perf_fee accrual 不會重複觸發)。
    """
    if amount <= 0:
        raise LedgerError(f"referral payout amount must be positive, got {amount}")

    referrer_acct = await get_or_create_user_account(db, referrer_user_id, currency)
    fee_revenue_acct = await _platform_fee_revenue_account(db, currency)

    ledger_tx = LedgerTransaction(
        type=LedgerTxType.REFERRAL_PAYOUT.value,
        status=LedgerTxStatus.POSTED.value,
        amount=amount,
        currency=currency,
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=fee_revenue_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=amount,
                currency=currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=referrer_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=amount,
                currency=currency,
            ),
        ]
    )

    logger.info(
        "referral_payout_posted",
        ledger_tx_id=ledger_tx.id,
        referrer_user_id=referrer_user_id,
        amount=str(amount),
    )
    return ledger_tx
