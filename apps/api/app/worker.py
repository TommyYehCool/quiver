"""arq worker 設定 — Phase 1 沒任務，先佔位 noop。"""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings

from app.core.config import settings
from app.core.logging import configure_logging, get_logger


async def noop(ctx: dict[str, Any]) -> str:
    """Placeholder — Phase 3+ 會被真實任務取代。"""
    return "noop"


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    get_logger(__name__).info("worker_starting")


async def shutdown(ctx: dict[str, Any]) -> None:
    get_logger(__name__).info("worker_stopping")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


class WorkerSettings:
    functions = [noop]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
