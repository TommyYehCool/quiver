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
