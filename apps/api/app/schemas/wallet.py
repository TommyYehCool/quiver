"""Wallet schemas。"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class WalletOut(BaseModel):
    address: str
    network: Literal["testnet", "mainnet"]
    coin: str = "TRX"
    token: str = "USDT-TRC20"


class BalanceOut(BaseModel):
    """User 的可動用餘額 + 處理中金額。"""

    available: Decimal  # ledger 算出來,可動用
    pending: Decimal  # 還在 PROVISIONAL 的入金
    currency: str = "USDT-TRC20"


class OnchainTxOut(BaseModel):
    """歷史交易紀錄(收款)。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tx_hash: str
    amount: Decimal
    currency: str
    status: str
    confirmations: int
    block_number: int | None
    created_at: datetime
    posted_at: datetime | None
