"""Auth service — Google OAuth user upsert + role 判斷。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User, UserRole

logger = get_logger(__name__)


async def upsert_google_user(
    db: AsyncSession,
    google_userinfo: dict[str, Any],
) -> User:
    """從 Google userinfo 建立或更新 user record。

    `ADMIN_EMAILS` env list 內的 email 自動 promote 為 ADMIN。
    """
    email = google_userinfo["email"].lower()
    google_sub = google_userinfo["sub"]

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    is_admin = email in {e.lower() for e in settings.admin_emails}
    target_roles = (
        [UserRole.USER.value, UserRole.ADMIN.value] if is_admin else [UserRole.USER.value]
    )

    if user is None:
        user = User(
            email=email,
            display_name=google_userinfo.get("name"),
            avatar_url=google_userinfo.get("picture"),
            provider="google",
            provider_user_id=google_sub,
            roles=target_roles,
        )
        db.add(user)
        await db.flush()
        logger.info(
            "user_created",
            user_id=user.id,
            email=_mask_email(email),
            is_admin=is_admin,
        )
        # F-5b-4: funnel event — first OAuth login = signup_completed.
        # Fire-and-forget; failure logged in service, never re-raises.
        from app.services import funnel
        await funnel.track(
            db, user.id, funnel.SIGNUP_COMPLETED,
            properties={"is_admin": is_admin},
        )
    else:
        user.display_name = google_userinfo.get("name") or user.display_name
        user.avatar_url = google_userinfo.get("picture") or user.avatar_url
        user.provider = user.provider or "google"
        user.provider_user_id = user.provider_user_id or google_sub
        if set(user.roles) != set(target_roles):
            user.roles = target_roles
            logger.info("user_roles_updated", user_id=user.id, roles=target_roles)

    await db.commit()
    await db.refresh(user)
    return user


def _mask_email(email: str) -> str:
    """log 用：tom***@gmail.com"""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[:2]}***@{domain}"
