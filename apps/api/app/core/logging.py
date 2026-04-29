"""structlog 設定 — JSON 輸出 + request id binding。"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper()),
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            mask_secrets,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level.upper())),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_SECRET_KEYS = {
    "password",
    "jwt",
    "token",
    "secret",
    "api_key",
    "private_key",
    "mnemonic",
    "kek",
    "authorization",
    "cookie",
}


def mask_secrets(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """logging processor: 把可能含 secret 的欄位遮蔽。"""
    for key in list(event_dict.keys()):
        if any(s in key.lower() for s in _SECRET_KEYS):
            value = event_dict[key]
            if isinstance(value, str) and value:
                event_dict[key] = "***"
    return event_dict


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[no-any-return]
