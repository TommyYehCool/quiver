"""Double-entry ledger — Phase 3 只用 DEPOSIT type,Phase 4+ 擴充。

帳務模型:
- accounts: PLATFORM_CUSTODY (我們在鏈上實際保管的 USDT 池) + USER (每個用戶對 USDT 的請求權)
- ledger_transactions: 每一筆業務事件(deposit / transfer / withdrawal / reverse)
- ledger_entries: 雙複式記帳的 debit/credit 對,每個 transaction 必須借貸平衡

Phase 3 唯一的事件類型是 DEPOSIT:
  DR  PLATFORM_CUSTODY (USDT-TRC20)  +amount   ← 我們收到了真鏈上資產
  CR  USER (USDT-TRC20)              +amount   ← 用戶持有對該資產的請求權
"""

from __future__ import annotations

import enum
from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AccountKind(str, enum.Enum):
    USER = "USER"
    PLATFORM_CUSTODY = "PLATFORM_CUSTODY"  # 我們在鏈上的保管池
    FEE_PAYER = "FEE_PAYER"  # Phase 5+ 用,平台代付 TRX 用


class LedgerTxType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    TRANSFER = "TRANSFER"  # Phase 4+
    WITHDRAWAL = "WITHDRAWAL"  # Phase 5+
    REVERSE = "REVERSE"  # Phase 5+
    EARN_OUTBOUND = "EARN_OUTBOUND"  # F-Phase 3 / Path A:USDT 從 HOT 送到 user 的 Bitfinex


class LedgerTxStatus(str, enum.Enum):
    POSTED = "POSTED"
    REVERSED = "REVERSED"  # Phase 5+


class EntryDirection(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "currency", name="uq_accounts_user_kind_currency"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False)


class LedgerTransaction(Base, TimestampMixin):
    __tablename__ = "ledger_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=LedgerTxStatus.POSTED.value
    )
    onchain_tx_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("onchain_txs.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(String(200))


class LedgerEntry(Base, TimestampMixin):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ledger_tx_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ledger_transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False)
