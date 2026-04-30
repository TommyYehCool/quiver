"""FastAPI dependencies。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import COOKIE_NAME, TokenError, decode_access_token
from app.models.login_session import LoginSession
from app.models.user import User, UserRole, UserStatus

DbDep = Annotated[AsyncSession, Depends(get_db)]

# 限流 last_seen_at 寫入頻率,避免熱 row(每分鐘最多更新一次)
_LAST_SEEN_THROTTLE = timedelta(minutes=1)


async def get_current_user(
    db: DbDep,
    session_token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> User:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "auth.notAuthenticated"},
        )
    try:
        payload = decode_access_token(session_token)
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "auth.invalidToken"},
        ) from e

    user_id = int(payload["sub"])
    jti = payload.get("jti")

    # 沒帶 jti(舊 token 過渡):允許 — 等 token 過期重簽就會帶
    # 帶 jti:檢查 session 沒被 revoke
    if jti:
        sess_q = await db.execute(
            select(LoginSession).where(LoginSession.jti == jti)
        )
        sess = sess_q.scalar_one_or_none()
        if sess is None or sess.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "auth.sessionRevoked"},
            )
        # 限流更新 last_seen_at(避免每個 request 都熱寫)
        now = datetime.now(UTC)
        last_seen = sess.last_seen_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=UTC)
        if now - last_seen > _LAST_SEEN_THROTTLE:
            await db.execute(
                update(LoginSession)
                .where(LoginSession.id == sess.id)
                .values(last_seen_at=now)
            )
            await db.commit()

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "auth.userNotFound"},
        )
    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "auth.userSuspended"},
        )
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def get_current_jti(
    session_token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> str | None:
    """取出當前 request 的 jti,用來標記「這是我目前的裝置」。
    沒 token / 解不出來 / token 沒 jti 都回 None。
    """
    if not session_token:
        return None
    try:
        payload = decode_access_token(session_token)
    except TokenError:
        return None
    return payload.get("jti")


CurrentJtiDep = Annotated[str | None, Depends(get_current_jti)]


async def get_current_admin(user: CurrentUserDep) -> User:
    if UserRole.ADMIN.value not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "auth.adminRequired"},
        )
    return user


CurrentAdminDep = Annotated[User, Depends(get_current_admin)]
