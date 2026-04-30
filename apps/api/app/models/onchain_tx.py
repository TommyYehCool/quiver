"""鏈上交易紀錄 — 對應 Tatum webhook 收到的入金事件。

兩段式狀態:
  PROVISIONAL  剛收到通知,尚未足夠 block 確認,**不能動用**
  POSTED       ≥ 19 block 確認,已寫入 ledger,可動用
  INVALID      被取消/雙花,作廢
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class OnchainTxStatus(str, enum.Enum):
    PROVISIONAL = "PROVISIONAL"
    POSTED = "POSTED"
    INVALID = "INVALID"


class OnchainTx(Base, TimestampMixin):
    __tablename__ = "onchain_txs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tx_hash: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_address: Mapped[str] = mapped_column(String(34), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False, server_default="USDT-TRC20")
    block_number: Mapped[int | None] = mapped_column(BigInteger)
    confirmations: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=OnchainTxStatus.PROVISIONAL.value, index=True
    )
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
