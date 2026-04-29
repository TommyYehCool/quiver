"""FastAPI dependencies。"""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import COOKIE_NAME, TokenError, decode_access_token
from app.models.user import User, UserRole, UserStatus

DbDep = Annotated[AsyncSession, Depends(get_db)]


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


async def get_current_admin(user: CurrentUserDep) -> User:
    if UserRole.ADMIN.value not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "auth.adminRequired"},
        )
    return user


CurrentAdminDep = Annotated[User, Depends(get_current_admin)]
