"""arq worker 設定。"""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.services.email import send_kyc_approved, send_kyc_rejected


async def noop(ctx: dict[str, Any]) -> str:
    """Placeholder。"""
    return "noop"


async def kyc_send_approved_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
) -> bool:
    return await send_kyc_approved(to=to, display_name=display_name)


async def kyc_send_rejected_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
    reason: str,
) -> bool:
    return await send_kyc_rejected(to=to, display_name=display_name, reason=reason)


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    get_logger(__name__).info("worker_starting")


async def shutdown(ctx: dict[str, Any]) -> None:
    get_logger(__name__).info("worker_stopping")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


class WorkerSettings:
    functions = [noop, kyc_send_approved_email, kyc_send_rejected_email]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
