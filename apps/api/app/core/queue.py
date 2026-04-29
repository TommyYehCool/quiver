"""arq enqueue helper — API endpoint 把任務丟給 worker。"""

from __future__ import annotations

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings


async def get_arq_pool() -> ArqRedis:
    """每個 enqueue 開新 pool;arq 會自動共用 connection。"""
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))
