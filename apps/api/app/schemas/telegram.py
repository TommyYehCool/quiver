"""Pydantic schemas for the F-5a-4.1 Telegram binding endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TelegramBindCodeOut(BaseModel):
    """Returned by POST /api/telegram/generate-bind-code.

    The deep_link is what the UI opens in a new tab — Telegram handles the
    rest. The expires_at is shown in the UI countdown so users don't get
    stuck staring at a stale code.
    """
    bind_code: str
    deep_link: str
    expires_at: datetime
    bot_username: str  # for "Open @{bot_username}" UI label


class TelegramStatusOut(BaseModel):
    """Returned by GET /api/telegram/status — cheap probe for the UI."""
    bot_configured: bool
    bot_username: str | None
    bound: bool
    chat_id: int | None
    username: str | None
    bound_at: datetime | None
