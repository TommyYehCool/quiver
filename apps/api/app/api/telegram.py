"""Telegram bot binding endpoints (F-5a-4.1).

Three endpoints:

  - POST   /api/telegram/generate-bind-code (auth) — generates a 30-min one-time
    code + deep link for the user to bind their Telegram account.
  - POST   /api/telegram/webhook            (no auth, secret-token verified) —
    Telegram POSTs every incoming message here. We handle /start <code>
    by binding chat_id ↔ user.
  - DELETE /api/telegram/disconnect         (auth) — clear the binding.
  - GET    /api/telegram/status             (auth) — probe for the UI.

The webhook is the only public-facing endpoint; we lock it down with the
X-Telegram-Bot-Api-Secret-Token header check (set when calling setWebhook).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.telegram import TelegramBindCodeOut, TelegramStatusOut
from app.services import telegram as telegram_service

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# GET /api/telegram/status
# ─────────────────────────────────────────────────────────


@router.get("/status", response_model=ApiResponse[TelegramStatusOut])
async def get_telegram_status(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[TelegramStatusOut]:
    """Cheap probe: returns whether the bot is configured + this user's bind state."""
    return ApiResponse[TelegramStatusOut].ok(
        TelegramStatusOut(
            bot_configured=telegram_service.is_configured(),
            bot_username=telegram_service.get_bot_username(),
            bound=user.telegram_chat_id is not None,
            chat_id=user.telegram_chat_id,
            username=user.telegram_username,
            bound_at=user.telegram_bound_at,
        )
    )


# ─────────────────────────────────────────────────────────
# POST /api/telegram/generate-bind-code
# ─────────────────────────────────────────────────────────


@router.post(
    "/generate-bind-code", response_model=ApiResponse[TelegramBindCodeOut]
)
async def generate_bind_code(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[TelegramBindCodeOut]:
    """Generate a one-time bind code + deep link for the user.

    Idempotent in the sense that calling twice within the TTL just regenerates
    a fresh code and overwrites the previous one — old code stops working.
    """
    if not telegram_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "telegram.notConfigured"},
        )
    if user.telegram_chat_id is not None:
        # Already bound. Caller should disconnect first if they want to re-bind.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "telegram.alreadyBound"},
        )

    code = telegram_service.generate_bind_code()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=telegram_service.BIND_CODE_TTL_MINUTES
    )

    user.telegram_bind_code = code
    user.telegram_bind_code_expires_at = expires_at
    await db.commit()

    logger.info(
        "telegram_bind_code_generated",
        user_id=user.id,
        expires_at=expires_at.isoformat(),
    )
    return ApiResponse[TelegramBindCodeOut].ok(
        TelegramBindCodeOut(
            bind_code=code,
            deep_link=telegram_service.build_deep_link(code),
            expires_at=expires_at,
            bot_username=telegram_service.get_bot_username() or "",
        )
    )


# ─────────────────────────────────────────────────────────
# POST /api/telegram/webhook  (called by Telegram, NOT user)
# ─────────────────────────────────────────────────────────


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: DbDep,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Receive incoming Telegram messages. Currently handles /start <code> only.

    Returns 200 + empty body even on errors — Telegram retries non-200
    responses repeatedly, which we don't want for malformed payloads. We
    log + swallow.
    """
    if not telegram_service.verify_webhook_secret(x_telegram_bot_api_secret_token):
        logger.warning(
            "telegram_webhook_secret_mismatch",
            received_header_present=x_telegram_bot_api_secret_token is not None,
        )
        # Return 200 not 401 — don't leak info about secret presence.
        return {"ok": False}

    payload = await request.json()
    parsed = telegram_service.parse_start_command(payload)
    if parsed is None:
        # Not a /start <code> message — could be plain /start, group invite,
        # whatever. Acknowledge silently.
        return {"ok": True}

    chat_id, username, code = parsed

    # Look up user by bind code; check expiry.
    q = await db.execute(
        select(User).where(User.telegram_bind_code == code)
    )
    user = q.scalar_one_or_none()
    if user is None:
        # Unknown code — could be stale, brute-force, or someone shared a
        # link to the wrong person. Reply with a soft error to the sender.
        try:
            await telegram_service.send_message(
                chat_id,
                "⚠️ 這個連結已失效或從未產生過。請回到 Quiver /earn/bot-settings 重新點 Connect Telegram。",
            )
        except Exception:  # noqa: BLE001
            pass
        logger.warning("telegram_webhook_code_not_found", code=code, chat_id=chat_id)
        return {"ok": True}

    now = datetime.now(timezone.utc)
    if (
        user.telegram_bind_code_expires_at is None
        or user.telegram_bind_code_expires_at < now
    ):
        # Expired. Clear the code so this user has to regenerate.
        user.telegram_bind_code = None
        user.telegram_bind_code_expires_at = None
        await db.commit()
        try:
            await telegram_service.send_message(
                chat_id,
                "⚠️ 這個連結已過期(30 分鐘有效)。請回到 Quiver 重新產生。",
            )
        except Exception:  # noqa: BLE001
            pass
        logger.info("telegram_webhook_code_expired", user_id=user.id, chat_id=chat_id)
        return {"ok": True}

    # Check whether this chat_id is already bound to ANOTHER user (e.g., the
    # TG account was previously bound to a different Quiver email). UNIQUE
    # constraint would also catch this, but a clean rejection message is
    # nicer than a 500.
    other_q = await db.execute(
        select(User).where(
            User.telegram_chat_id == chat_id, User.id != user.id
        )
    )
    other = other_q.scalar_one_or_none()
    if other is not None:
        try:
            await telegram_service.send_message(
                chat_id,
                "⚠️ 這個 Telegram 帳號已綁定到另一個 Quiver 帳號。請先 disconnect 再重新綁。",
            )
        except Exception:  # noqa: BLE001
            pass
        # Clear the code so the user doesn't re-trigger.
        user.telegram_bind_code = None
        user.telegram_bind_code_expires_at = None
        await db.commit()
        logger.warning(
            "telegram_webhook_chat_id_already_bound",
            chat_id=chat_id,
            new_user_id=user.id,
            existing_user_id=other.id,
        )
        return {"ok": True}

    # All checks pass — bind!
    user.telegram_chat_id = chat_id
    user.telegram_username = username
    user.telegram_bound_at = now
    user.telegram_bind_code = None
    user.telegram_bind_code_expires_at = None
    await db.commit()

    try:
        await telegram_service.send_message(
            chat_id,
            (
                "✅ <b>已綁定 Quiver 帳號</b>\n\n"
                f"從現在起,你的 Quiver 部位事件(借出成功、利息結算、spike 抓到等)"
                "會自動推到這裡。\n\n"
                "想隨時取消 → Quiver /earn/bot-settings → Disconnect。"
            ),
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "telegram_webhook_confirm_send_failed",
            user_id=user.id,
            chat_id=chat_id,
            error=str(e),
        )

    logger.info(
        "telegram_webhook_bound",
        user_id=user.id,
        chat_id=chat_id,
        username=username,
    )
    return {"ok": True}


# ─────────────────────────────────────────────────────────
# DELETE /api/telegram/disconnect
# ─────────────────────────────────────────────────────────


@router.delete("/disconnect", response_model=ApiResponse[TelegramStatusOut])
async def disconnect_telegram(
    user: CurrentUserDep, db: DbDep
) -> ApiResponse[TelegramStatusOut]:
    """Clear all telegram_* fields. Safe to call when not bound (no-op)."""
    if user.telegram_chat_id is None:
        # Not bound — return current state, no DB write.
        return ApiResponse[TelegramStatusOut].ok(
            TelegramStatusOut(
                bot_configured=telegram_service.is_configured(),
                bot_username=telegram_service.get_bot_username(),
                bound=False,
                chat_id=None,
                username=None,
                bound_at=None,
            )
        )

    prev_chat_id = user.telegram_chat_id
    user.telegram_chat_id = None
    user.telegram_username = None
    user.telegram_bound_at = None
    user.telegram_bind_code = None
    user.telegram_bind_code_expires_at = None
    await db.commit()

    logger.info(
        "telegram_disconnected",
        user_id=user.id,
        prev_chat_id=prev_chat_id,
    )
    return ApiResponse[TelegramStatusOut].ok(
        TelegramStatusOut(
            bot_configured=telegram_service.is_configured(),
            bot_username=telegram_service.get_bot_username(),
            bound=False,
            chat_id=None,
            username=None,
            bound_at=None,
        )
    )
