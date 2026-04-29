"""System setup (KEK bootstrap) schemas。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SetupStatusOut(BaseModel):
    """目前 setup 狀態 — 給前端決定要不要顯示 setup 頁。"""

    initialized: bool
    awaiting_verify: bool
    kek_present_in_env: bool
    kek_matches_db: bool | None  # None if no row yet


class KekGenerateOut(BaseModel):
    kek_b64: str
    kek_hash_preview: str  # 前 8 chars,for UI 抽問顯示


class KekVerifyIn(BaseModel):
    kek_b64: str = Field(min_length=44, max_length=44)  # base64 of 32 bytes


class KekVerifyOut(BaseModel):
    initialized: bool
    next_step: str  # 提示前端下一步要做什麼
