"""Centralized Telegram notification formatters for F-5a-4.x events.

Why a dedicated module instead of inline in auto_lend / reconcile / perf_fee:

  - Each event has its own message format that we'll iterate on (copy
    tweaks, emoji, locale variants). One file is easier to evolve than
    three scattered `_notify_xxx` functions.

  - All notification senders share the same boilerplate: open fresh DB
    session, lookup user.telegram_chat_id, no-op if not bound or bot
    unconfigured, format message, send with try/except. Co-locating
    this means each new event is a 30-line helper, not a copy-paste
    of all the boilerplate.

  - All notifications are fire-and-forget by design — the caller wraps
    each call in `asyncio.create_task(...)` and never awaits. A Telegram
    outage / 403 / network fail must NEVER fail the underlying pipeline
    (auto-lend submit, reconcile cron, perf_fee settlement).

Each notify_* function:
  1. Probes telegram_service.is_configured() — cheap exit when bot unset
  2. Opens its own DB session (caller's session may already be closed)
  3. Looks up user; exits silently if user.telegram_chat_id is None
  4. Formats HTML message
  5. send_message() inside try/except — logs warnings, never raises
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.logging import get_logger
from app.services import telegram as telegram_service

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────


async def _resolve_chat_id(user_id: int) -> int | None:
    """Return user.telegram_chat_id or None. Opens its own session.

    Centralized so each notify_* function isn't 6 lines of boilerplate.
    """
    from app.core.db import AsyncSessionLocal
    from app.models.user import User

    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User.telegram_chat_id).where(User.id == user_id))
        return q.scalar_one_or_none()


async def _safe_send(chat_id: int, text: str, *, event_name: str, user_id: int) -> None:
    """Wrap send_message with logging — never re-raise (fire-and-forget)."""
    try:
        await telegram_service.send_message(chat_id, text)
        logger.info("telegram_notify_ok", event=event_name, user_id=user_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "telegram_notify_failed",
            event=event_name,
            user_id=user_id,
            error=str(e),
        )


# ─────────────────────────────────────────────────────────
# notify_lent_event — auto-lend offer(s) successfully submitted
# ─────────────────────────────────────────────────────────


async def notify_lent_event(
    *,
    user_id: int,
    ladder: list[tuple[Decimal, Decimal | None, int]],
    offer_ids: list[int],
    kind: str = "fresh",
) -> None:
    """Notification for successful funding offer submission.

    `kind`:
      - "fresh" → fresh deposit auto-lend (auto_lend_finalizer success)
      - "renew" → reconcile auto-renew of idle funds after maturity

    `ladder` items are (chunk_amount, chunk_rate_daily, period_days).
    """
    if not telegram_service.is_configured():
        return
    chat_id = await _resolve_chat_id(user_id)
    if chat_id is None:
        return

    total_amount = sum((c for c, _, _ in ladder), Decimal(0))

    # Weighted-avg APR across rated tranches (skip None/FRR rows)
    rated = [(c, r, p) for c, r, p in ladder if r is not None]
    weighted_apr: Decimal | None = None
    if rated:
        denom = sum((c for c, _, _ in rated), Decimal(0))
        if denom > 0:
            weighted_apr = (
                sum((c * r * Decimal(365) * Decimal(100) for c, r, _ in rated), Decimal(0))
                / denom
            )

    periods = sorted({p for _, _, p in ladder})
    period_str = (
        f"{periods[0]} 天" if len(periods) == 1
        else f"{periods[0]}-{periods[-1]} 天"
    )

    if weighted_apr is not None:
        apr_line = f"加權平均 APR: <b>{weighted_apr:.2f}%</b>"
    else:
        apr_line = "利率: FRR(浮動)"

    if len(ladder) > 1:
        ladder_line = f"📊 {len(ladder)} 階 ladder · {period_str}"
    else:
        ladder_line = f"⏱ 期間 {period_str}"

    if kind == "renew":
        header = "🔄 <b>Quiver 自動續借</b>"
        footer = "<i>下次到期再續。</i>"
    else:
        header = "✅ <b>Quiver 借出成功</b>"
        footer = "<i>下次有 idle 時自動續借。</i>"

    text = (
        f"{header}\n\n"
        f"金額: <b>${total_amount:,.2f}</b>\n"
        f"{apr_line}\n"
        f"{ladder_line}\n\n"
        f"{footer}"
    )

    await _safe_send(chat_id, text, event_name=f"lent_{kind}", user_id=user_id)


# ─────────────────────────────────────────────────────────
# notify_spike_captured — a credit just filled at high APR
# ─────────────────────────────────────────────────────────


async def notify_spike_captured(
    *,
    user_id: int,
    amount: Decimal,
    apr_pct: Decimal,
    period_days: int,
    expires_at_ms: int,
    expected_interest: Decimal,
    current_frr_apr: Decimal | None = None,
) -> None:
    """Notification when a new active funding credit is detected with APR
    above the spike threshold (default 12%).

    These are the screenshot-worthy events — 「Quiver 抓到 14.5% APR!」
    is exactly what users post to Telegram channels. Fire 1 message per
    captured credit.
    """
    if not telegram_service.is_configured():
        return
    chat_id = await _resolve_chat_id(user_id)
    if chat_id is None:
        return

    expires_at = datetime.fromtimestamp(expires_at_ms / 1000, tz=timezone.utc)
    expires_str = expires_at.strftime("%m/%d")

    # vs FRR comparison line — only if we have FRR data
    if current_frr_apr is not None and current_frr_apr > 0:
        delta = apr_pct - current_frr_apr
        if delta > 0:
            frr_line = (
                f"\n比目前 FRR (<b>{current_frr_apr:.2f}%</b>) "
                f"高 +{delta:.2f}%"
            )
        else:
            frr_line = f"\n目前 FRR: {current_frr_apr:.2f}%"
    else:
        frr_line = ""

    text = (
        f"🔥 <b>抓到 Spike!</b>\n\n"
        f"金額: <b>${amount:,.2f}</b>\n"
        f"APR: <b>{apr_pct:.2f}%</b>{frr_line}\n"
        f"鎖定 {period_days} 天 (到期 {expires_str})\n"
        f"預計利息: <b>~${expected_interest:,.2f}</b>\n\n"
        f"<i>Quiver ladder 的高利 tranche 被借走 — 這就是策略 pay off 的時刻。</i>"
    )

    await _safe_send(chat_id, text, event_name="spike_captured", user_id=user_id)


# ─────────────────────────────────────────────────────────
# notify_dunning_paused / _resumed — perf fee dunning state changes
# ─────────────────────────────────────────────────────────


async def notify_dunning_paused(
    *,
    user_id: int,
    pending_amount: Decimal,
    pending_count: int,
) -> None:
    """Sent when perf_fee.evaluate_dunning auto-pauses the user's auto-lend
    after ≥4 unpaid weekly accruals."""
    if not telegram_service.is_configured():
        return
    chat_id = await _resolve_chat_id(user_id)
    if chat_id is None:
        return

    text = (
        "⚠️ <b>Quiver 已暫停你的 auto-lend</b>\n\n"
        f"連續 {pending_count} 週未付 fee (共 <b>${pending_amount:,.2f}</b>)。\n"
        "已 lent 部位不受影響,自然到期回 funding wallet — 但新的 idle funds 不會自動掛單。\n\n"
        "<b>恢復方式</b>\n"
        f"1. 儲值 Quiver wallet 至 ${pending_amount:,.2f}+,下個週一 cron 自動恢復\n"
        "2. 升級 Premium → 0% 績效費永久免煩惱\n\n"
        "<a href=\"https://quiverdefi.com/zh-TW/earn/bot-settings\">→ 前往 bot-settings 處理</a>"
    )

    await _safe_send(chat_id, text, event_name="dunning_paused", user_id=user_id)


async def notify_dunning_resumed(*, user_id: int) -> None:
    """Sent when perf_fee.evaluate_dunning auto-resumes the user's auto-lend
    after they've topped up enough to settle all pending accruals."""
    if not telegram_service.is_configured():
        return
    chat_id = await _resolve_chat_id(user_id)
    if chat_id is None:
        return

    text = (
        "✅ <b>Quiver 已恢復 auto-lend</b>\n\n"
        "Quiver wallet 已補齊欠款,下次有 idle funds 會自動掛單。\n\n"
        "<i>感謝補繳!策略繼續跑。</i>"
    )

    await _safe_send(chat_id, text, event_name="dunning_resumed", user_id=user_id)
