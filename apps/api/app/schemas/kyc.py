"""KYC API schemas。"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class KycSubmissionOut(BaseModel):
    """使用者自己看的 submission 資訊(不含敏感檔案路徑)。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    legal_name: str | None
    id_number: str | None
    birth_date: date | None
    country: str | None
    status: str
    reject_reason: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class KycAdminListItem(BaseModel):
    """admin list 用 — 帶 user 概要。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str
    user_display_name: str | None
    legal_name: str | None
    country: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class KycAdminDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str
    user_display_name: str | None
    legal_name: str | None
    id_number: str | None
    birth_date: date | None
    country: str | None
    has_id_front: bool
    has_id_back: bool
    has_selfie: bool
    has_proof_of_address: bool
    status: str
    reject_reason: str | None
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class KycRejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1024)


class KycListOut(BaseModel):
    items: list[KycAdminListItem]
    total: int
    page: int
    page_size: int
