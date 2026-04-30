"""Rates endpoints — USDT 兌 TWD 給前端顯示用。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep
from app.core.logging import get_logger
from app.schemas.api import ApiResponse
from app.schemas.rates import RateOut
from app.services.rates import RateUnavailable, get_usdt_twd_rate

router = APIRouter(prefix="/api/rates", tags=["rates"])
logger = get_logger(__name__)


@router.get("/usdt-twd", response_model=ApiResponse[RateOut])
async def get_usdt_twd(_: CurrentUserDep) -> ApiResponse[RateOut]:
    """需登入(避免被當匯率 API 公開使用)。60s cache。"""
    try:
        info = await get_usdt_twd_rate()
    except RateUnavailable as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "rates.unavailable"},
        ) from e
    return ApiResponse[RateOut].ok(
        RateOut(
            pair=info.pair,
            rate=info.rate,
            fetched_at=info.fetched_at,
            source=info.source,
        )
    )
