"""Sentry 初始化(phase 6E-3)。

DSN 空字串 → 不啟用(dev / 測試環境)。
production 設 SENTRY_DSN 即生效。
"""

from __future__ import annotations

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def init_sentry(*, component: str) -> bool:
    """初始化 Sentry。回傳是否成功啟用。

    component: "api" / "worker",寫到 tag 方便分流。
    """
    if not settings.sentry_dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.asyncio import AsyncioIntegration
    except ImportError as e:
        logger.warning("sentry_sdk_not_installed", error=str(e))
        return False

    try:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.env,
            release=settings.sentry_release or None,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            # 預設只送 unhandled errors,不送 info / warn
            send_default_pii=False,
            integrations=[AsyncioIntegration()],
        )
        sentry_sdk.set_tag("component", component)
        logger.info("sentry_initialized", component=component, env=settings.env)
        return True
    except Exception as e:
        logger.warning("sentry_init_failed", component=component, error=str(e))
        return False
