"""Withdrawal service。

Phase 5A 涵蓋:submit / approve / reject(+ REVERSE 退款 ledger 寫入)。
Phase 5B 才會做真正的 broadcast / confirm。

設計:
- Submit 時立刻寫一筆 WITHDRAWAL ledger_tx,扣 user (DR) / 入 PLATFORM_CUSTODY (CR)
  → 這筆視為「凍結」效果,user 餘額立刻變少,沒辦法重複提領
- 大額 (≥ WITHDRAWAL_LARGE_THRESHOLD_USD) 走 PENDING_REVIEW,小額直接 APPROVED
- Reject / Failed 時寫 REVERSE ledger_tx,把 ledger 退回給 user
  → 原 WITHDRAWAL 不刪、不改 status,留作 audit;REVERSE 是 compensating entry
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from bip_utils import TrxAddrDecoder
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.kyc import KycStatus, KycSubmission
from app.models.ledger import (
    Account,
    AccountKind,
    EntryDirection,
    LedgerEntry,
    LedgerTransaction,
    LedgerTxStatus,
    LedgerTxType,
)
from app.models.user import User
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
from app.services.ledger import balance_for_account, get_or_create_user_account

logger = get_logger(__name__)
CURRENCY = "USDT-TRC20"


class WithdrawalError(Exception):
    def __init__(self, code: str, http_status: int = 400):
        super().__init__(code)
        self.code = code
        self.http_status = http_status


@dataclass
class WithdrawalCreated:
    withdrawal_id: int
    status: str
    fee: Decimal
    needs_admin_review: bool


def _validate_tron_address(addr: str) -> None:
    try:
        TrxAddrDecoder.DecodeAddr(addr)
    except Exception as e:
        raise WithdrawalError("withdrawal.invalidAddress") from e


async def _kyc_approved(db: AsyncSession, user_id: int) -> bool:
    q = await db.execute(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.id.desc())
        .limit(1)
    )
    sub = q.scalar_one_or_none()
    return sub is not None and sub.status == KycStatus.APPROVED.value


async def _platform_custody(db: AsyncSession, currency: str) -> Account:
    q = await db.execute(
        select(Account).where(
            Account.user_id.is_(None),
            Account.kind == AccountKind.PLATFORM_CUSTODY.value,
            Account.currency == currency,
        )
    )
    acct = q.scalar_one_or_none()
    if acct is None:
        raise WithdrawalError("withdrawal.custodyMissing", http_status=500)
    return acct


async def submit_withdrawal(
    db: AsyncSession,
    *,
    user: User,
    to_address: str,
    amount: Decimal,
    currency: str = CURRENCY,
) -> WithdrawalCreated:
    """User 送出提領申請。"""
    if amount <= 0:
        raise WithdrawalError("withdrawal.amountMustBePositive")
    if amount < settings.min_withdrawal_usdt:
        raise WithdrawalError("withdrawal.belowMinimum")

    _validate_tron_address(to_address)

    if not await _kyc_approved(db, user.id):
        raise WithdrawalError("withdrawal.kycRequired", http_status=403)

    fee = settings.withdrawal_fee_usdt
    total = amount + fee

    user_acct = await get_or_create_user_account(db, user.id, currency)
    custody_acct = await _platform_custody(db, currency)

    # Lock 兩邊帳戶,順序 by id
    locked_ids = sorted([user_acct.id, custody_acct.id])
    await db.execute(
        select(Account).where(Account.id.in_(locked_ids)).with_for_update().order_by(Account.id)
    )

    # 鎖內檢查餘額
    user_balance = await balance_for_account(db, user_acct.id)
    if user_balance < total:
        raise WithdrawalError("withdrawal.insufficientFunds")

    # 大額判斷(USDT ≈ USD 在 phase 5A 直接比)
    needs_review = amount >= settings.withdrawal_large_threshold_usd
    initial_status = (
        WithdrawalStatus.PENDING_REVIEW.value if needs_review else WithdrawalStatus.APPROVED.value
    )

    # 寫凍結 ledger_tx + entries
    ledger_tx = LedgerTransaction(
        type=LedgerTxType.WITHDRAWAL.value,
        status=LedgerTxStatus.POSTED.value,
        onchain_tx_id=None,
        amount=total,
        currency=currency,
        note=f"withdrawal to {to_address}",
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=user_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=total,
                currency=currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=custody_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=total,
                currency=currency,
            ),
        ]
    )

    # 寫 withdrawal_requests
    req = WithdrawalRequest(
        user_id=user.id,
        amount=amount,
        fee=fee,
        currency=currency,
        to_address=to_address,
        status=initial_status,
        ledger_tx_id=ledger_tx.id,
    )
    db.add(req)

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise WithdrawalError("withdrawal.commitFailed", http_status=500) from e

    await db.refresh(req)
    logger.info(
        "withdrawal_submitted",
        withdrawal_id=req.id,
        user_id=user.id,
        amount=str(amount),
        fee=str(fee),
        status=initial_status,
    )
    return WithdrawalCreated(
        withdrawal_id=req.id,
        status=initial_status,
        fee=fee,
        needs_admin_review=needs_review,
    )


async def _write_reverse_entries(
    db: AsyncSession, original_ledger_tx_id: int, original_amount: Decimal, currency: str
) -> int:
    """寫 REVERSE compensating entries — 退回給 user。"""
    # 找到原本的兩筆 entries,用反向再寫一次
    q = await db.execute(
        select(LedgerEntry).where(LedgerEntry.ledger_tx_id == original_ledger_tx_id)
    )
    originals = q.scalars().all()
    if len(originals) != 2:
        raise WithdrawalError("withdrawal.reverseFailed", http_status=500)

    rev_tx = LedgerTransaction(
        type=LedgerTxType.REVERSE.value,
        status=LedgerTxStatus.POSTED.value,
        onchain_tx_id=None,
        amount=original_amount,
        currency=currency,
        note=f"reverse of ledger_tx {original_ledger_tx_id}",
    )
    db.add(rev_tx)
    await db.flush()

    for orig in originals:
        rev_dir = (
            EntryDirection.CREDIT.value
            if orig.direction == EntryDirection.DEBIT.value
            else EntryDirection.DEBIT.value
        )
        db.add(
            LedgerEntry(
                ledger_tx_id=rev_tx.id,
                account_id=orig.account_id,
                direction=rev_dir,
                amount=orig.amount,
                currency=orig.currency,
            )
        )
    return rev_tx.id


async def admin_approve(
    db: AsyncSession, admin: User, withdrawal_id: int
) -> WithdrawalRequest:
    q = await db.execute(
        select(WithdrawalRequest).where(WithdrawalRequest.id == withdrawal_id)
    )
    req = q.scalar_one_or_none()
    if req is None:
        raise WithdrawalError("withdrawal.notFound", http_status=404)
    if req.status != WithdrawalStatus.PENDING_REVIEW.value:
        raise WithdrawalError(
            f"withdrawal.cannotApproveFrom_{req.status}", http_status=409
        )

    req.status = WithdrawalStatus.APPROVED.value
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    logger.info("withdrawal_approved", withdrawal_id=req.id, admin_id=admin.id)
    return req


async def admin_reject(
    db: AsyncSession, admin: User, withdrawal_id: int, reason: str
) -> WithdrawalRequest:
    q = await db.execute(
        select(WithdrawalRequest).where(WithdrawalRequest.id == withdrawal_id)
    )
    req = q.scalar_one_or_none()
    if req is None:
        raise WithdrawalError("withdrawal.notFound", http_status=404)
    # 只允許從還沒上鏈的狀態 reject(PENDING_REVIEW / APPROVED)
    if req.status not in (
        WithdrawalStatus.PENDING_REVIEW.value,
        WithdrawalStatus.APPROVED.value,
    ):
        raise WithdrawalError(
            f"withdrawal.cannotRejectFrom_{req.status}", http_status=409
        )

    if req.ledger_tx_id is not None:
        await _write_reverse_entries(
            db, req.ledger_tx_id, req.amount + req.fee, req.currency
        )

    req.status = WithdrawalStatus.REJECTED.value
    req.reject_reason = reason
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(req)
    logger.info(
        "withdrawal_rejected",
        withdrawal_id=req.id,
        admin_id=admin.id,
    )
    return req
