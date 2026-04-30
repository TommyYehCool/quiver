"""內部互轉 service — atomic 雙複式記帳。

設計:
- 使用 PostgreSQL row-level lock(`SELECT ... FOR UPDATE`)鎖住 sender 帳戶,防止 double-spend race
- 鎖的順序按 account.id 升冪,避免兩個 transfer 同時鎖一對帳戶造成 deadlock
- 全程 single DB transaction:檢查餘額 + 寫 ledger_tx + 寫 entries
- KYC: 雙方都需 APPROVED 才能轉

Phase 4 沒有 fee — 內部互轉完全免費。
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.kyc import KycStatus, KycSubmission
from app.models.ledger import (
    Account,
    EntryDirection,
    LedgerEntry,
    LedgerTransaction,
    LedgerTxStatus,
    LedgerTxType,
)
from app.models.user import User
from app.services.ledger import balance_for_account, get_or_create_user_account

logger = get_logger(__name__)

CURRENCY = "USDT-TRC20"


class TransferError(Exception):
    """轉帳失敗的業務錯誤,包含 error code 給前端翻譯。"""

    def __init__(self, code: str, http_status: int = 400):
        super().__init__(code)
        self.code = code
        self.http_status = http_status


@dataclass
class TransferResult:
    ledger_tx_id: int
    sender_balance_after: Decimal
    recipient_email: str


async def _user_kyc_approved(db: AsyncSession, user_id: int) -> bool:
    result = await db.execute(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.id.desc())
        .limit(1)
    )
    sub = result.scalar_one_or_none()
    return sub is not None and sub.status == KycStatus.APPROVED.value




async def execute_transfer(
    db: AsyncSession,
    *,
    sender: User,
    recipient_email: str,
    amount: Decimal,
    note: str | None,
    currency: str = CURRENCY,
) -> TransferResult:
    """執行內部轉帳(完整 atomic)。"""
    if amount <= 0:
        raise TransferError("transfer.amountMustBePositive")

    # 找收件人(用 email,小寫比對)
    recipient_q = await db.execute(
        select(User).where(User.email == recipient_email.lower().strip())
    )
    recipient = recipient_q.scalar_one_or_none()
    if recipient is None:
        raise TransferError("transfer.recipientNotFound", http_status=404)
    if recipient.id == sender.id:
        raise TransferError("transfer.selfTransfer")
    if not recipient.is_active:
        raise TransferError("transfer.recipientSuspended")

    # KYC 雙方都要 APPROVED
    if not await _user_kyc_approved(db, sender.id):
        raise TransferError("transfer.senderKycRequired", http_status=403)
    if not await _user_kyc_approved(db, recipient.id):
        raise TransferError("transfer.recipientKycRequired", http_status=403)

    # 確保兩邊帳戶都存在
    sender_acct = await get_or_create_user_account(db, sender.id, currency)
    recipient_acct = await get_or_create_user_account(db, recipient.id, currency)

    # 鎖定 — 按 account.id 升冪,避免 deadlock
    locked_ids = sorted([sender_acct.id, recipient_acct.id])
    await db.execute(
        select(Account).where(Account.id.in_(locked_ids)).with_for_update().order_by(Account.id)
    )

    # 鎖內檢查 sender 餘額
    sender_balance = await balance_for_account(db, sender_acct.id)
    if sender_balance < amount:
        raise TransferError("transfer.insufficientFunds")

    # 寫 ledger_transaction + 雙複式 entries
    ledger_tx = LedgerTransaction(
        type=LedgerTxType.TRANSFER.value,
        status=LedgerTxStatus.POSTED.value,
        onchain_tx_id=None,
        amount=amount,
        currency=currency,
        note=note,
    )
    db.add(ledger_tx)
    await db.flush()

    db.add_all(
        [
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=sender_acct.id,
                direction=EntryDirection.DEBIT.value,
                amount=amount,
                currency=currency,
            ),
            LedgerEntry(
                ledger_tx_id=ledger_tx.id,
                account_id=recipient_acct.id,
                direction=EntryDirection.CREDIT.value,
                amount=amount,
                currency=currency,
            ),
        ]
    )

    # 通知收件人
    from app.models.notification import NotificationType
    from app.services.notifications import create_notification

    create_notification(
        db,
        recipient.id,
        NotificationType.TRANSFER_RECEIVED,
        params={
            "amount": str(amount),
            "currency": currency,
            "sender_email": sender.email,
            "sender_display_name": sender.display_name,
            "note": note,
        },
    )

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.exception("transfer_commit_integrity_error")
        raise TransferError("transfer.commitFailed") from e

    sender_balance_after = sender_balance - amount
    logger.info(
        "transfer_posted",
        ledger_tx_id=ledger_tx.id,
        sender_id=sender.id,
        recipient_id=recipient.id,
        amount=str(amount),
        currency=currency,
    )
    return TransferResult(
        ledger_tx_id=ledger_tx.id,
        sender_balance_after=sender_balance_after,
        recipient_email=recipient.email,
    )


@dataclass
class RecipientPreview:
    email: str
    display_name: str | None
    kyc_approved: bool
    is_self: bool


async def lookup_recipient(
    db: AsyncSession, sender: User, recipient_email: str
) -> RecipientPreview | None:
    """收件人 preview — 給前端 confirm modal 顯示對方資訊。"""
    email = recipient_email.lower().strip()
    if not email:
        return None
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return None
    return RecipientPreview(
        email=user.email,
        display_name=user.display_name,
        kyc_approved=await _user_kyc_approved(db, user.id),
        is_self=(user.id == sender.id),
    )
