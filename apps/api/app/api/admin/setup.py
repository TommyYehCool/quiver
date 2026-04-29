"""Admin setup endpoints — KEK bootstrap 流程。

3 個 endpoint:
  GET  /api/admin/setup/status         看目前狀態
  POST /api/admin/setup/generate-kek   產生新 KEK(只能呼叫一次,直到完成或被 reset)
  POST /api/admin/setup/verify-kek     貼回 KEK 驗證 + 產生 master seed

成功完成後 admin 必須:
  1. 把 KEK b64 寫進 .env 的 KEK_CURRENT_B64
  2. docker compose restart api worker
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.system_keys import SystemKey, SystemKeyState
from app.schemas.api import ApiResponse
from app.schemas.setup import (
    KekGenerateOut,
    KekVerifyIn,
    KekVerifyOut,
    SetupStatusOut,
)
from app.services import crypto

router = APIRouter(prefix="/api/admin/setup", tags=["admin-setup"])
logger = get_logger(__name__)


async def _load_system_key(db: DbDep) -> SystemKey | None:
    result = await db.execute(select(SystemKey).order_by(SystemKey.id.asc()).limit(1))
    return result.scalar_one_or_none()


@router.get("/status", response_model=ApiResponse[SetupStatusOut])
async def get_status(_: CurrentAdminDep, db: DbDep) -> ApiResponse[SetupStatusOut]:
    row = await _load_system_key(db)

    env_kek_b64 = settings.kek_current_b64.get_secret_value()
    kek_present = bool(env_kek_b64)

    kek_match: bool | None = None
    if row is not None and kek_present:
        try:
            env_kek = crypto.kek_from_b64(env_kek_b64)
            kek_match = crypto.kek_hash(env_kek) == row.kek_hash
        except crypto.CryptoError:
            kek_match = False

    return ApiResponse[SetupStatusOut].ok(
        SetupStatusOut(
            initialized=row is not None and row.state == SystemKeyState.INITIALIZED.value,
            awaiting_verify=row is not None and row.state == SystemKeyState.AWAITING_VERIFY.value,
            kek_present_in_env=kek_present,
            kek_matches_db=kek_match,
        )
    )


@router.post("/generate-kek", response_model=ApiResponse[KekGenerateOut])
async def generate_kek(admin: CurrentAdminDep, db: DbDep) -> ApiResponse[KekGenerateOut]:
    row = await _load_system_key(db)
    if row is not None and row.state == SystemKeyState.INITIALIZED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "setup.alreadyInitialized"},
        )

    kek = crypto.generate_kek()
    kek_b64 = crypto.kek_to_b64(kek)
    h = crypto.kek_hash(kek)

    if row is None:
        row = SystemKey(
            state=SystemKeyState.AWAITING_VERIFY.value,
            kek_hash=h,
            master_seed_ciphertext=None,
        )
        db.add(row)
    else:
        row.state = SystemKeyState.AWAITING_VERIFY.value
        row.kek_hash = h
        row.master_seed_ciphertext = None

    await db.commit()
    logger.info("kek_generated", admin_id=admin.id, kek_hash_preview=h[:16])

    return ApiResponse[KekGenerateOut].ok(
        KekGenerateOut(kek_b64=kek_b64, kek_hash_preview=h[:8])
    )


@router.post("/verify-kek", response_model=ApiResponse[KekVerifyOut])
async def verify_kek(
    payload: KekVerifyIn,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[KekVerifyOut]:
    row = await _load_system_key(db)
    if row is None or row.state != SystemKeyState.AWAITING_VERIFY.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "setup.notAwaitingVerify"},
        )

    try:
        kek = crypto.kek_from_b64(payload.kek_b64)
    except crypto.CryptoError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "setup.invalidKekFormat"},
        ) from e

    if crypto.kek_hash(kek) != row.kek_hash:
        logger.warning("kek_verify_failed", admin_id=admin.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "setup.kekMismatch"},
        )

    # 產生 master seed (32 bytes 隨機),用 KEK 加密
    import secrets

    master_seed = secrets.token_bytes(32)
    envelope = crypto.encrypt(master_seed, kek, key_version=row.key_version)

    row.master_seed_ciphertext = envelope.ciphertext_b64
    row.state = SystemKeyState.INITIALIZED.value
    await db.commit()

    logger.info("system_initialized", admin_id=admin.id)

    return ApiResponse[KekVerifyOut].ok(
        KekVerifyOut(
            initialized=True,
            next_step="setup.writeKekToEnvAndRestart",
        )
    )
