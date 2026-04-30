"""Auth endpoints — Google OAuth + cookie session。

流程：
  1. Frontend 把使用者導到 /api/auth/google/login → 後端再 302 到 Google
  2. Google 同意後 callback /api/auth/google/callback → 換 token + userinfo
  3. upsert user → 簽 JWT → 寫 HttpOnly cookie → 302 回 frontend
"""

from __future__ import annotations

from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from starlette import status

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.core.security import (
    COOKIE_NAME,
    TokenError,
    clear_session_cookie,
    create_access_token,
    decode_access_token,
    generate_jti,
    set_session_cookie,
)
from app.models.login_session import LoginSession
from app.services.auth import upsert_google_user
from sqlalchemy import update
from datetime import UTC, datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = get_logger(__name__)


oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id.get_secret_value(),
    client_secret=settings.google_client_secret.get_secret_value(),
    client_kwargs={"scope": "openid email profile"},
)


def _redirect_uri() -> str:
    return f"{settings.api_base_url}/api/auth/google/callback"


def _frontend_redirect(path: str = "/", error: str | None = None) -> str:
    base = settings.frontend_base_url.rstrip("/")
    if error:
        return f"{base}{path}?{urlencode({'auth_error': error})}"
    return f"{base}{path}"


@router.get(
    "/google/login",
    dependencies=[Depends(rate_limit("auth_login", limit=10, window=60))],
)
async def google_login(request: Request, locale: str = "zh-TW") -> RedirectResponse:
    """把 user 導到 Google OAuth consent。

    locale 帶在 query 是讓 callback 後 redirect 回正確的語系頁面。
    """
    request.session["post_login_locale"] = locale if locale in {"zh-TW", "en"} else "zh-TW"
    return await oauth.google.authorize_redirect(  # type: ignore[no-any-return]
        request, _redirect_uri()
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: DbDep) -> RedirectResponse:
    """Google 回 callback → 換 token + userinfo → upsert user → 簽 JWT。"""
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as e:
        logger.warning("oauth_failed", error=str(e))
        return RedirectResponse(
            url=_frontend_redirect("/login", error="oauth_failed"),
            status_code=status.HTTP_302_FOUND,
        )

    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("email_verified"):
        return RedirectResponse(
            url=_frontend_redirect("/login", error="email_unverified"),
            status_code=status.HTTP_302_FOUND,
        )

    user = await upsert_google_user(db, dict(userinfo))

    # 建 LoginSession,讓「登出所有裝置」能精準作用
    jti = generate_jti()
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    db.add(LoginSession(user_id=user.id, jti=jti, ip=ip, user_agent=user_agent))

    from app.models.audit_log import ActorKind
    from app.services.audit import write_audit
    await write_audit(
        db, actor=user, action="auth.login_success",
        target_kind="USER", target_id=user.id,
        payload={"jti": jti}, request=request,
        actor_kind_override=ActorKind.ADMIN if "ADMIN" in list(user.roles) else ActorKind.USER,
    )
    await db.commit()

    jwt_token = create_access_token(
        user_id=user.id,
        email=user.email,
        roles=list(user.roles),
        jti=jti,
    )

    locale = request.session.pop("post_login_locale", "zh-TW")
    redirect = RedirectResponse(
        url=_frontend_redirect(f"/{locale}/dashboard"),
        status_code=status.HTTP_302_FOUND,
    )
    set_session_cookie(redirect, jwt_token)
    logger.info("login_success", user_id=user.id, jti=jti)
    return redirect


@router.post("/logout")
async def logout(
    request: Request,
    db: DbDep,
) -> Response:
    """登出此裝置 — clear cookie + revoke 此 session。"""
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            payload = decode_access_token(token)
            jti = payload.get("jti")
            if jti:
                await db.execute(
                    update(LoginSession)
                    .where(LoginSession.jti == jti, LoginSession.revoked_at.is_(None))
                    .values(revoked_at=datetime.now(UTC))
                )
                await db.commit()
        except TokenError:
            pass  # token 已壞,直接清 cookie 就好

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
