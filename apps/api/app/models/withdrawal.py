"""提領申請 — 從 user 派生地址送 USDT 到外部地址。

狀態機(phase 5A 涵蓋 ~APPROVED/REJECTED;phase 5B 才走完整 lifecycle):

  PENDING_REVIEW ──────────► REJECTED
       │                         │
       │ admin approve           │ (REVERSE ledger)
       ▼                         │
   APPROVED ──► PROCESSING ──► BROADCASTING ──► COMPLETED
       │            │              │
       │            │              ▼
       │            └──────────► FAILED
       │                           │ (REVERSE ledger)
       ▼
   PENDING(小額自動進)
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WithdrawalStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"   # 大額,等 admin
    APPROVED = "APPROVED"               # admin 批准 / 小額自動,等 worker 廣播
    PROCESSING = "PROCESSING"           # worker 拿到、簽 tx 中
    BROADCASTING = "BROADCASTING"       # 已廣播,等 confirmations
    COMPLETED = "COMPLETED"             # ≥ 19 confirmations
    REJECTED = "REJECTED"               # admin 退,REVERSE 退款
    FAILED = "FAILED"                   # 廣播 / 上鏈失敗,REVERSE 退款


class WithdrawalRequest(Base, TimestampMixin):
    __tablename__ = "withdrawal_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False, server_default="USDT-TRC20")
    to_address: Mapped[str] = mapped_column(String(34), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)

    # 連到凍結的 ledger_tx(WITHDRAWAL POSTED,扣 user 的)
    ledger_tx_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ledger_transactions.id", ondelete="SET NULL")
    )
    # phase 5B 才會填:廣播後拿到的 tx_hash
    tx_hash: Mapped[str | None] = mapped_column(String(80), unique=True)

    reject_reason: Mapped[str | None] = mapped_column(String(1024))
    reviewed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
