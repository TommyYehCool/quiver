"""JWT + cookie helpers."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Response
from jose import JWTError, jwt

from app.core.config import settings

COOKIE_NAME = "quiver_session"


class TokenError(Exception):
    """JWT 驗證錯誤。"""


def generate_jti() -> str:
    """產生 JWT ID — 對應 login_sessions.jti。32 hex chars,夠唯一。"""
    return secrets.token_hex(16)


def create_access_token(
    user_id: int,
    email: str,
    roles: list[str],
    jti: str,
    expires_seconds: int | None = None,
) -> str:
    now = datetime.now(UTC)
    expires = now + timedelta(seconds=expires_seconds or settings.jwt_expires_seconds)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "roles": roles,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "iss": "quiver",
    }
    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            issuer="quiver",
        )
    except JWTError as e:
        raise TokenError(f"invalid token: {e}") from e


def set_session_cookie(
    response: Response, token: str, *, secure: bool | None = None
) -> None:
    """寫 HttpOnly + SameSite=Lax cookie。

    Secure flag 來源:
    - secure 顯式傳入(callsite 從 request scheme 推):用該值
    - 預設(None):用 settings.cookie_secure(從 frontend_base_url 推)

    這樣同一個 process 既可服務 localhost(HTTP, secure=False)又可服務 ngrok(HTTPS, secure=True)。
    """
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.jwt_expires_seconds,
        httponly=True,
        secure=settings.cookie_secure if secure is None else secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
