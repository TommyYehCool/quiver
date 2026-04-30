"""USDT 兌 TWD 即時匯率 — 從 BitoPro 公開 API 抓,60s in-memory cache。

`GET https://api.bitopro.com/v3/tickers/usdt_twd` → `data.lastPrice`(string Decimal)。

不需要 API key。任何錯誤(網路 / 5xx / 解析失敗)會 fallback 到上次 cached 值;
如果完全沒 cache 過,raise RateUnavailable 讓 endpoint 回 503。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

CACHE_TTL = timedelta(seconds=60)
TIMEOUT = 5.0


class RateUnavailable(Exception):
    """無法拿到匯率(BitoPro 掛掉、第一次 fetch 失敗等)。"""


@dataclass(frozen=True)
class RateInfo:
    pair: str
    rate: Decimal
    fetched_at: datetime
    source: str


# Module-level cache (single-process)
_cache: RateInfo | None = None
_lock = asyncio.Lock()


def _is_fresh(info: RateInfo, now: datetime) -> bool:
    return now - info.fetched_at < CACHE_TTL


async def _fetch_bitopro_usdt_twd() -> Decimal:
    url = f"{settings.bitopro_base_url.rstrip('/')}/tickers/usdt_twd"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(url)
    if res.status_code >= 400:
        raise RateUnavailable(f"bitopro http {res.status_code}")
    body = res.json()
    raw = body.get("data", {}).get("lastPrice")
    if raw is None:
        raise RateUnavailable(f"bitopro response missing data.lastPrice: {body}")
    try:
        rate = Decimal(str(raw))
    except Exception as e:
        raise RateUnavailable(f"bitopro lastPrice not parseable: {raw}") from e
    if rate <= 0:
        raise RateUnavailable(f"bitopro returned non-positive rate: {rate}")
    return rate


async def get_usdt_twd_rate() -> RateInfo:
    """拿 USDT/TWD 匯率,優先從 cache,過期 / 沒有就重抓。"""
    global _cache
    now = datetime.now(timezone.utc)

    # Fast path: cache hit
    if _cache is not None and _is_fresh(_cache, now):
        return _cache

    # Slow path: fetch with single-flight lock
    async with _lock:
        # 重新檢查 — lock 期間可能有別的 coroutine 已經更新
        if _cache is not None and _is_fresh(_cache, datetime.now(timezone.utc)):
            return _cache

        try:
            rate = await _fetch_bitopro_usdt_twd()
            _cache = RateInfo(
                pair="USDT-TWD",
                rate=rate,
                fetched_at=datetime.now(timezone.utc),
                source="bitopro",
            )
            logger.info("usdt_twd_rate_fetched", rate=str(rate))
            return _cache
        except (httpx.HTTPError, RateUnavailable) as e:
            logger.warning("usdt_twd_rate_fetch_failed", error=str(e))
            if _cache is not None:
                # 用過期 cache 也比沒有好(degraded mode)
                logger.info("usdt_twd_rate_using_stale_cache", age_s=(datetime.now(timezone.utc) - _cache.fetched_at).total_seconds())
                return _cache
            raise RateUnavailable(str(e)) from e
