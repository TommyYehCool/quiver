"""FastAPI app entry point。"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.api import auth, kyc, me, rates, transfers, wallet, webhooks, withdrawals
from app.api.admin import dev as admin_dev
from app.api.admin import kyc as admin_kyc
from app.api.admin import platform as admin_platform
from app.api.admin import setup as admin_setup
from app.api.admin import withdrawals as admin_withdrawals
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.schemas.api import ApiResponse


async def _verify_kek_consistency() -> None:
    """啟動時檢查 env 的 KEK 與 DB 中存的 hash 是否一致。

    - 若 system_keys 不存在或 state=AWAITING_VERIFY:不需要 KEK,允許啟動
    - 若 state=INITIALIZED 但 env 沒 KEK:拒絕啟動
    - 若 state=INITIALIZED 且 env 有 KEK 但 hash 不一致:拒絕啟動
    """
    from sqlalchemy import select

    from app.core.db import db_session
    from app.models.system_keys import SystemKey, SystemKeyState
    from app.services import crypto

    logger = get_logger(__name__)

    async with db_session() as session:
        result = await session.execute(select(SystemKey).order_by(SystemKey.id.asc()).limit(1))
        row = result.scalar_one_or_none()

    if row is None:
        logger.info("kek_check_skipped_no_row")
        return
    if row.state != SystemKeyState.INITIALIZED.value:
        logger.info("kek_check_skipped_not_initialized", state=row.state)
        return

    env_kek_b64 = settings.kek_current_b64.get_secret_value()
    if not env_kek_b64:
        logger.error("kek_missing_in_env")
        raise RuntimeError(
            "System is INITIALIZED but KEK_CURRENT_B64 is empty in env. "
            "Restore KEK to .env and restart."
        )

    try:
        kek = crypto.kek_from_b64(env_kek_b64)
    except crypto.CryptoError as e:
        raise RuntimeError(f"KEK_CURRENT_B64 has invalid format: {e}") from e

    if crypto.kek_hash(kek) != row.kek_hash:
        logger.error("kek_hash_mismatch")
        raise RuntimeError(
            "KEK_CURRENT_B64 in env does not match DB hash. "
            "Either env KEK is wrong or DB was tampered. Refusing to start."
        )

    logger.info("kek_check_ok")


async def _sync_tatum_subscriptions_best_effort() -> None:
    """啟動時對所有已有 tron_address 的 user 同步 Tatum 訂閱。

    完全 best-effort:任何失敗(ngrok 沒起、Tatum 沒設、API 暫時掛了)都只 log,不擋 startup。
    管理員可隨時呼叫 POST /api/admin/setup/sync-tatum 手動再來一次。
    """
    from app.core.db import db_session
    from app.services.subscription import resolve_callback_url, sync_all_subscriptions

    logger = get_logger(__name__)
    try:
        callback_url = await resolve_callback_url()
    except Exception as e:
        logger.warning("tatum_sync_resolve_url_failed", error=str(e))
        return
    if not callback_url:
        logger.info("tatum_sync_skipped_no_url")
        return

    try:
        async with db_session() as session:
            stats = await sync_all_subscriptions(session, callback_url)
        logger.info(
            "tatum_sync_lifespan_done",
            callback_url=callback_url,
            created=stats.created,
            refreshed=stats.refreshed,
            skipped=stats.skipped,
            failed=stats.failed,
        )
    except Exception as e:
        logger.warning("tatum_sync_lifespan_failed", error=str(e))


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    logger = get_logger(__name__)
    await _verify_kek_consistency()
    logger.info("api_starting", env=settings.env)
    # ngrok 容器可能還沒起好,稍等一下再去抓 tunnel URL
    import asyncio

    async def deferred_sync() -> None:
        await asyncio.sleep(3)
        await _sync_tatum_subscriptions_best_effort()

    asyncio.create_task(deferred_sync())  # noqa: RUF006 — fire-and-forget
    yield
    logger.info("api_stopping")


app = FastAPI(
    title="Quiver API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.jwt_secret.get_secret_value(),
    same_site="lax",
    https_only=settings.cookie_secure,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
    try:
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
    finally:
        structlog.contextvars.clear_contextvars()


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    get_logger(__name__).exception("unhandled_exception", error=str(exc))
    return JSONResponse(
        status_code=500,
        content=ApiResponse[None].fail("server.internalError").model_dump(),
    )


# ---- routes ----

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(kyc.router)
app.include_router(wallet.router)
app.include_router(transfers.router)
app.include_router(withdrawals.router)
app.include_router(rates.router)
app.include_router(webhooks.router)
app.include_router(admin_kyc.router)
app.include_router(admin_setup.router)
app.include_router(admin_dev.router)
app.include_router(admin_withdrawals.router)
app.include_router(admin_platform.router)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz() -> dict[str, str]:
    return {"status": "ready"}
