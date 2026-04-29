"""Wallet schemas。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class WalletOut(BaseModel):
    address: str
    network: Literal["testnet", "mainnet"]
    coin: str = "TRX"
    token: str = "USDT-TRC20"
