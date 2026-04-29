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

from app.api import auth, kyc, me
from app.api.admin import kyc as admin_kyc
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.schemas.api import ApiResponse


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    logger = get_logger(__name__)
    logger.info("api_starting", env=settings.env)
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
app.include_router(admin_kyc.router)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz() -> dict[str, str]:
    return {"status": "ready"}
