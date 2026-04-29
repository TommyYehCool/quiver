"""統一 API response 格式：success / data / error。

錯誤訊息只給 code + params，翻譯由前端處理。
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    params: dict[str, Any] = {}


class ApiResponse(BaseModel, Generic[T]):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    success: bool
    data: T | None = None
    error: ErrorDetail | None = None

    @classmethod
    def ok(cls, data: T | None = None) -> "ApiResponse[T]":
        return cls(success=True, data=data)

    @classmethod
    def fail(cls, code: str, params: dict[str, Any] | None = None) -> "ApiResponse[T]":
        return cls(success=False, error=ErrorDetail(code=code, params=params or {}))
