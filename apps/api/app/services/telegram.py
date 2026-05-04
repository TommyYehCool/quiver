"""Telegram bot service — outbound messaging + inbound webhook parsing (F-5a-4.1).

Quiver uses a single bot (created via @BotFather) to push notifications to
users who've explicitly bound their account. The flow:

  1. User clicks "Connect Telegram" on /earn/bot-settings → API generates a
     one-time bind code (8 chars, 30-min TTL) and a deep link
     https://t.me/{bot_username}?start={code}.
  2. User opens the link in Telegram, taps Start. Telegram POSTs an `update`
     to our webhook with the message text "/start <code>".
  3. Our webhook verifies X-Telegram-Bot-Api-Secret-Token, extracts the code,
     looks up the user, sets telegram_chat_id, sends a confirmation reply.
  4. From then on, auto_lend_finalizer (and future events) push messages to
     that chat_id via send_message().

Design choices:

  - **Configurability gates**: every public function checks `is_configured()`
    first. If TELEGRAM_BOT_TOKEN is unset (e.g., dev environments where
    nobody's set up a bot), all functions no-op gracefully. The product
    keeps working; just no notifications.

  - **Fire-and-forget messages**: callers wrap send_message in
    `asyncio.create_task(...)` so a Telegram outage / 5xx never blocks the
    main pipeline (e.g., we never want to FAIL an auto-lend because Telegram
    is down).

  - **Webhook secret**: when calling setWebhook, we pass a `secret_token`.
    Telegram includes it in `X-Telegram-Bot-Api-Secret-Token` header on
    every update. We reject any update without the matching header — this
    prevents anyone who guesses our webhook URL from spoofing /start
    commands.
"""

from __future__ import annotations

import secrets
import string
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"

# Bind codes are short, user-readable in the deep link, but cryptographically
# random. 8 chars from 32-char alphabet = ~5e11 combinations — collision-free
# at our scale, brute-force resistant within the 30-min TTL.
BIND_CODE_ALPHABET = string.ascii_uppercase + string.digits  # no lowercase / no 0OI1L confusion
BIND_CODE_LENGTH = 8
BIND_CODE_TTL_MINUTES = 30


class TelegramConfigError(RuntimeError):
    """Raised when callers explicitly require Telegram (e.g., the API
    endpoint /api/telegram/generate-bind-code) but the bot isn't configured."""


class TelegramSendError(RuntimeError):
    """Raised when Telegram's API returns an error to send_message.

    Callers using fire-and-forget pattern just log + swallow this; only the
    one-shot setWebhook helper propagates."""


# ─────────────────────────────────────────────────────────
# Configuration probe
# ─────────────────────────────────────────────────────────


def is_configured() -> bool:
    """Bot is usable iff token AND username are both set."""
    return bool(
        settings.telegram_bot_token.get_secret_value()
        and settings.telegram_bot_username
    )


def get_bot_username() -> str | None:
    """Return bot username (sans '@') if configured; for building deep links."""
    return settings.telegram_bot_username or None


# ─────────────────────────────────────────────────────────
# Bind code generation (used by /api/telegram/generate-bind-code)
# ─────────────────────────────────────────────────────────


def generate_bind_code() -> str:
    """Crypto-random 8-char code: 32-char alphabet, ~5e11 combinations.

    secrets.choice is the right primitive here — token_urlsafe gives base64
    which has lowercase + symbols (worse for the user typing it back if they
    have to). We optimize for "user can read it from a screenshot."
    """
    return "".join(secrets.choice(BIND_CODE_ALPHABET) for _ in range(BIND_CODE_LENGTH))


def build_deep_link(code: str) -> str:
    """Telegram deep link for the bind flow.

    Tapping this opens Telegram, shows the bot's intro, and on Start sends
    "/start <code>" as a message. The bot's webhook receives it and binds.
    """
    bot_username = get_bot_username()
    if not bot_username:
        raise TelegramConfigError("telegram_bot_username not set")
    return f"https://t.me/{bot_username}?start={code}"


# ─────────────────────────────────────────────────────────
# Outbound: send_message
# ─────────────────────────────────────────────────────────


async def send_message(
    chat_id: int,
    text: str,
    *,
    parse_mode: str = "HTML",
    disable_web_page_preview: bool = True,
) -> None:
    """POST to Telegram sendMessage. No-ops if bot is not configured.

    Use HTML parse_mode (default) for limited formatting: <b>bold</b>,
    <i>italic</i>, <code>mono</code>, <a href="...">link</a>. Markdown is
    finicky around special chars; HTML is robust.

    Caller's responsibility to wrap in asyncio.create_task() if they want
    fire-and-forget semantics. By default this awaits the round-trip so
    test code can assert on it.
    """
    if not is_configured():
        logger.info(
            "telegram_send_skipped_not_configured",
            chat_id=chat_id,
            text_preview=text[:60],
        )
        return

    url = f"{TELEGRAM_API_BASE}/bot{settings.telegram_bot_token.get_secret_value()}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_page_preview,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 400:
            # Most common: 403 = user blocked the bot, or 400 = chat not found
            # (user deleted the chat). Both mean "user opted out de facto" —
            # log and move on; future work could clear the binding here.
            logger.warning(
                "telegram_send_failed",
                chat_id=chat_id,
                status=response.status_code,
                response=response.text[:200],
            )
            raise TelegramSendError(
                f"Telegram API returned {response.status_code}: {response.text[:200]}"
            )
        logger.info("telegram_send_ok", chat_id=chat_id, text_len=len(text))
    except httpx.RequestError as e:
        # Network error — Telegram unreachable. Log and continue; caller
        # using create_task will swallow this exception.
        logger.warning("telegram_send_network_error", chat_id=chat_id, error=str(e))
        raise TelegramSendError(f"network: {e}") from e


# ─────────────────────────────────────────────────────────
# Inbound: webhook payload parsing
# ─────────────────────────────────────────────────────────


def verify_webhook_secret(header_value: str | None) -> bool:
    """Compare provided header to configured webhook secret in constant time.

    Telegram includes our pre-configured secret in every webhook POST as the
    X-Telegram-Bot-Api-Secret-Token header. If the header doesn't match, the
    request is either spoofed (someone guessed our webhook URL) or our
    setWebhook setup is mis-configured.

    Returns True only if both secret is configured AND header matches.
    """
    expected = settings.telegram_webhook_secret.get_secret_value()
    if not expected:
        # If we forgot to set the secret, fail closed — better to drop legit
        # webhooks than to accept spoofed ones.
        logger.warning("telegram_webhook_secret_not_configured")
        return False
    if not header_value:
        return False
    return secrets.compare_digest(header_value, expected)


def parse_start_command(payload: dict[str, Any]) -> tuple[int, str | None, str] | None:
    """Extract (chat_id, username, bind_code) from a Telegram webhook update.

    Returns None if this update isn't a /start <code> message (could be any
    other message type — group chat add, button callback, etc — we ignore).

    Telegram update shape (the bits we care about):
      {
        "update_id": 123,
        "message": {
          "from": {"id": 456, "username": "alice"},
          "chat": {"id": 456, "type": "private"},
          "text": "/start ABCD1234"
        }
      }
    """
    message = payload.get("message")
    if not isinstance(message, dict):
        return None
    text = message.get("text")
    if not isinstance(text, str) or not text.startswith("/start"):
        return None
    # "/start ABCD1234" → ["/start", "ABCD1234"]; "/start" alone has no code
    parts = text.split(maxsplit=1)
    if len(parts) != 2:
        return None
    code = parts[1].strip().upper()
    if not code or not all(c in BIND_CODE_ALPHABET for c in code):
        return None
    chat = message.get("chat")
    if not isinstance(chat, dict):
        return None
    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return None
    # Username may not be set (Telegram users can have no @username)
    sender = message.get("from") or {}
    username = sender.get("username") if isinstance(sender, dict) else None
    if username is not None and not isinstance(username, str):
        username = None
    return chat_id, username, code


# ─────────────────────────────────────────────────────────
# Setup helper: setWebhook (called once after bot creation, manually or via admin)
# ─────────────────────────────────────────────────────────


async def set_webhook(webhook_url: str) -> dict[str, Any]:
    """Register the webhook URL with Telegram (one-time setup).

    Telegram will then POST every incoming message to webhook_url with the
    `X-Telegram-Bot-Api-Secret-Token` header set to telegram_webhook_secret.
    """
    if not is_configured():
        raise TelegramConfigError("Telegram bot not configured")
    secret = settings.telegram_webhook_secret.get_secret_value()
    if not secret:
        raise TelegramConfigError("telegram_webhook_secret must be set before setWebhook")

    url = f"{TELEGRAM_API_BASE}/bot{settings.telegram_bot_token.get_secret_value()}/setWebhook"
    payload = {
        "url": webhook_url,
        "secret_token": secret,
        # Restrict to the update types we actually handle; reduces noise.
        "allowed_updates": ["message"],
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload)
    response.raise_for_status()
    result = response.json()
    logger.info("telegram_set_webhook_done", url=webhook_url, result=result)
    return result
