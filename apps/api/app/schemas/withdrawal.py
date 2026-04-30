"""Withdrawal schemas。"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WithdrawalQuoteIn(BaseModel):
    amount: Decimal = Field(gt=0)


class WithdrawalQuoteOut(BaseModel):
    """送出前先 quote — 用戶看清楚 fee + total = 多少。"""

    amount: Decimal
    fee: Decimal
    total: Decimal
    currency: str = "USDT-TRC20"
    needs_admin_review: bool


class WithdrawalSubmitIn(BaseModel):
    to_address: str = Field(min_length=34, max_length=34)
    amount: Decimal = Field(gt=0)


class WithdrawalSubmitOut(BaseModel):
    withdrawal_id: int
    status: str
    fee: Decimal
    needs_admin_review: bool


class WithdrawalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: Decimal
    fee: Decimal
    currency: str
    to_address: str
    status: str
    tx_hash: str | None
    reject_reason: str | None
    reviewed_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminWithdrawalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str
    user_display_name: str | None
    amount: Decimal
    fee: Decimal
    currency: str
    to_address: str
    status: str
    tx_hash: str | None
    reject_reason: str | None
    reviewed_at: datetime | None
    created_at: datetime


class WithdrawalListOut(BaseModel):
    items: list[AdminWithdrawalOut]
    total: int
    page: int
    page_size: int


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1024)


class FeePayerInfo(BaseModel):
    address: str
    trx_balance: Decimal
    network: str  # "testnet" / "mainnet"
    low_balance_warning: bool
