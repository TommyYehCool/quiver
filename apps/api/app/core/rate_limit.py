"""Token-bucket rate limiter on Redis (phase 6E-3)。

設計:
- 每個 (key, bucket) 一個 redis key,INCR 後 EXPIRE 視窗(原子)
- 視窗到期自動歸零
- 沒接到 redis 時 fail-open(寬鬆 — 寧可不擋也不要把全站擋掉)
- key 通常是 IP,login 也可以加 email,sensitive 動作可以加 user_id

使用:
    @router.post("/login")
    async def login(_: Annotated[None, Depends(rate_limit("login", limit=5, window=60))]):
        ...
"""

from __future__ import annotations

from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: Redis | None = None


def _get_redis() -> Redis | None:
    """Lazy init redis client。"""
    global _redis
    if _redis is None:
        try:
            _redis = Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_timeout=0.5,
                socket_connect_timeout=0.5,
            )
        except Exception as e:
            logger.warning("rate_limit_redis_init_failed", error=str(e))
            return None
    return _redis


def _client_ip(request: Request) -> str:
    # 走 reverse proxy 時,X-Forwarded-For 會是真正 IP
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, *, limit: int, window: int) -> Callable[..., object]:
    """產一個 FastAPI dependency,套到 endpoint 上會做 IP-based rate limit。

    bucket: 識別這個 endpoint 的 string,e.g. "login"、"api_general"
    limit:  視窗內允許的請求數
    window: 視窗秒數
    """

    async def _check(request: Request) -> None:
        r = _get_redis()
        if r is None:
            return  # fail-open
        ip = _client_ip(request)
        key = f"rl:{bucket}:{ip}"
        try:
            # INCR + EXPIRE 用 pipeline,確保原子
            async with r.pipeline(transaction=True) as p:
                p.incr(key)
                p.expire(key, window)
                results = await p.execute()
            count = int(results[0])
        except Exception as e:
            # redis 出問題 → fail-open + log
            logger.warning("rate_limit_check_failed", bucket=bucket, ip=ip, error=str(e))
            return

        if count > limit:
            ttl = await r.ttl(key)
            retry_after = max(1, ttl)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "rate_limit.exceeded", "params": {"bucket": bucket}},
                headers={"Retry-After": str(retry_after)},
            )

    return _check


def RateLimitDep(bucket: str, *, limit: int, window: int) -> Annotated[None, Depends]:
    """方便 endpoint 加註的 helper。

    Usage:
        async def login(_: RateLimitDep("login", limit=5, window=60)):
            ...
    """
    return Annotated[None, Depends(rate_limit(bucket, limit=limit, window=window))]
