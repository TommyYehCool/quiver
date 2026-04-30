"""Transfer + history schemas。"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class TransferIn(BaseModel):
    recipient_email: EmailStr
    amount: Decimal = Field(gt=0)
    note: str | None = Field(default=None, max_length=200)


class TransferOut(BaseModel):
    ledger_tx_id: int
    sender_balance_after: Decimal
    recipient_email: str


class RecipientPreviewOut(BaseModel):
    email: str
    display_name: str | None
    kyc_approved: bool
    is_self: bool


class ActivityItemOut(BaseModel):
    id: str
    type: Literal["DEPOSIT", "TRANSFER_IN", "TRANSFER_OUT", "WITHDRAWAL", "REFUND"]
    amount: Decimal
    currency: str
    status: str
    note: str | None = None
    counterparty_email: str | None = None
    counterparty_display_name: str | None = None
    tx_hash: str | None = None
    created_at: datetime


class ActivityListOut(BaseModel):
    items: list[ActivityItemOut]
    total: int
    page: int
    page_size: int
