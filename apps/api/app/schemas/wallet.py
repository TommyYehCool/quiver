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
    """User 的多種餘額視角。

    `available` (ledger):真正可動用 — 扣掉送出的 + 加上收到的內部轉帳
    `onchain` (Tatum):你 derive 出來的 Tron 地址在鏈上的實際餘額,僅供參考
    `pending`: PROVISIONAL onchain_txs 加總,正在等 19 confirmation 的入金
    """

    available: Decimal
    onchain: Decimal
    pending: Decimal
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
