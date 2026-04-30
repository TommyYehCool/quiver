"""Tatum 訂閱協調 service。

Per-user 一筆 Tatum subscription,綁到 user.tatum_sub_id + tatum_sub_callback_url。

啟動時呼叫 `sync_all_subscriptions(db, callback_url)`:
  - 對每個有 tron_address 的 user
  - 若 sub_id 不存在 或 callback_url 不一致 → 刪舊訂閱、建新的、更新 user 的兩個欄位
  - 一致 → 跳過

新用戶第一次 derive 地址後也會 lazy 呼叫 `sync_user_subscription`。
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.services import tatum
from app.services.ngrok import get_public_url
from app.services.tatum import TatumError, TatumNotConfigured

logger = get_logger(__name__)


@dataclass
class SyncStats:
    created: int = 0
    refreshed: int = 0
    skipped: int = 0
    failed: int = 0


def webhook_callback_for(public_base_url: str) -> str:
    """組出 Tatum 要打的 webhook URL。"""
    token = settings.webhook_path_token.get_secret_value()
    return f"{public_base_url.rstrip('/')}/api/webhooks/tatum/{token}"


async def resolve_callback_url() -> str | None:
    """先看 env 是否硬寫了 WEBHOOK_CALLBACK_URL,沒設就從 ngrok 動態抓。

    回 None 表示無法決定 callback URL(ngrok 沒起 + env 沒設),調用者該 skip 訂閱流程。
    """
    if settings.webhook_callback_url:
        return settings.webhook_callback_url
    public = await get_public_url()
    if not public:
        return None
    return webhook_callback_for(public)


async def sync_user_subscription(
    db: AsyncSession, user: User, callback_url: str
) -> str:
    """對單一 user 跑訂閱同步。

    回 status string: "created" | "refreshed" | "skipped" | "no_address" | "failed:<reason>"
    """
    if not user.tron_address:
        return "no_address"

    # 已有 sub 且 URL 一致 → noop
    if user.tatum_sub_id and user.tatum_sub_callback_url == callback_url:
        return "skipped"

    # 有舊 sub 但 URL 變了 → 先刪
    if user.tatum_sub_id:
        try:
            await tatum.delete_subscription(user.tatum_sub_id)
        except (TatumError, TatumNotConfigured) as e:
            logger.warning(
                "tatum_old_sub_delete_failed",
                user_id=user.id,
                old_sub_id=user.tatum_sub_id,
                error=str(e),
            )
            # 繼續走 — 舊的可能本來就已經過期

    # 建新訂閱
    try:
        new_sub_id = await tatum.create_address_subscription(user.tron_address, callback_url)
    except TatumNotConfigured:
        return "failed:not_configured"
    except TatumError as e:
        logger.error("tatum_subscribe_failed", user_id=user.id, error=str(e))
        return f"failed:{e}"

    is_refresh = bool(user.tatum_sub_id)
    user.tatum_sub_id = new_sub_id
    user.tatum_sub_callback_url = callback_url
    await db.commit()

    return "refreshed" if is_refresh else "created"


async def sync_all_subscriptions(db: AsyncSession, callback_url: str) -> SyncStats:
    """對所有有 tron_address 的 user 跑同步。"""
    stats = SyncStats()
    result = await db.execute(select(User).where(User.tron_address.is_not(None)))
    users = result.scalars().all()

    for user in users:
        status = await sync_user_subscription(db, user, callback_url)
        if status == "created":
            stats.created += 1
        elif status == "refreshed":
            stats.refreshed += 1
        elif status == "skipped":
            stats.skipped += 1
        else:
            stats.failed += 1

    logger.info(
        "tatum_sync_done",
        users_total=len(users),
        created=stats.created,
        refreshed=stats.refreshed,
        skipped=stats.skipped,
        failed=stats.failed,
        callback=callback_url,
    )
    return stats
