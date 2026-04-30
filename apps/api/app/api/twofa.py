"""2FA TOTP endpoints (phase 6E-2)。

設定流程:
  1. POST /api/me/2fa/setup → 產 secret(暫存),回 provisioning URI 讓用戶掃 QR
  2. 用戶用 Authenticator app 看到 6 位 code,送
  3. POST /api/me/2fa/enable {code} → 驗 code 通過,寫到 user.totp_*,產 8 個 backup codes 一次性回給用戶
  4. POST /api/me/2fa/disable {code} → 驗 code 通過,清掉 totp_* + backup codes

注意:setup 階段的 secret 暫存在 user.totp_secret_enc(但 totp_enabled_at=NULL),
直到 enable verify 通過才設 enabled_at。
這樣設計簡單(不用另外 redis 存),但要小心:user 可以反覆 setup 蓋掉之前的 secret,但
只要 enable 還沒成功,中介層會把他當作沒 2FA。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select

from app.api.deps import CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.models.totp_backup_code import TotpBackupCode
from app.schemas.api import ApiResponse
from app.services import totp
from app.services.audit import write_audit

router = APIRouter(prefix="/api/me/2fa", tags=["account"])
logger = get_logger(__name__)


class TwoFAStatusOut(BaseModel):
    enabled: bool
    enabled_at: datetime | None
    backup_codes_remaining: int


class TwoFASetupOut(BaseModel):
    secret: str  # base32,讓用戶手動 copy 進 app(或對 QR 掃描失敗時備用)
    provisioning_uri: str  # otpauth://...,前端轉 QR


class TwoFACodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TwoFAEnableOut(BaseModel):
    backup_codes: list[str]  # 一次性顯示;用戶看完就消失,只能透過 reset 重發


class TwoFAOkOut(BaseModel):
    ok: bool = True


@router.get("", response_model=ApiResponse[TwoFAStatusOut])
async def get_2fa_status(user: CurrentUserDep, db: DbDep) -> ApiResponse[TwoFAStatusOut]:
    enabled = user.totp_enabled_at is not None
    remaining = await totp.count_unused_backup_codes(db, user_id=user.id) if enabled else 0
    return ApiResponse[TwoFAStatusOut].ok(
        TwoFAStatusOut(
            enabled=enabled,
            enabled_at=user.totp_enabled_at,
            backup_codes_remaining=remaining,
        )
    )


@router.post(
    "/setup",
    response_model=ApiResponse[TwoFASetupOut],
    dependencies=[Depends(rate_limit("2fa_setup", limit=5, window=300))],
)
async def setup_2fa(
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[TwoFASetupOut]:
    """產 secret(若已啟用,refuse — 要先 disable)。"""
    if user.totp_enabled_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "twofa.alreadyEnabled"},
        )
    secret = totp.generate_secret()
    ct, kv = await totp.encrypt_and_store_secret(db, user_id=user.id, secret=secret)
    user.totp_secret_enc = ct
    user.totp_key_version = kv
    user.totp_enabled_at = None  # 還沒驗
    await write_audit(
        db, actor=user, action="twofa.setup_started",
        target_kind="USER", target_id=user.id, request=request,
    )
    await db.commit()
    return ApiResponse[TwoFASetupOut].ok(
        TwoFASetupOut(
            secret=secret,
            provisioning_uri=totp.provisioning_uri(secret, user.email),
        )
    )


@router.post(
    "/enable",
    response_model=ApiResponse[TwoFAEnableOut],
    dependencies=[Depends(rate_limit("2fa_verify", limit=10, window=300))],
)
async def enable_2fa(
    payload: TwoFACodeIn,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[TwoFAEnableOut]:
    """驗 setup 階段的 code 通過 → 啟用 + 產 8 個 backup codes(一次性回)。"""
    if user.totp_secret_enc is None or user.totp_key_version is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "twofa.notInSetup"},
        )
    if user.totp_enabled_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "twofa.alreadyEnabled"},
        )

    secret = await totp.decrypt_user_secret(
        db, ciphertext_b64=user.totp_secret_enc, key_version=user.totp_key_version
    )
    if not totp.verify_code(secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "twofa.invalidCode"},
        )

    # 啟用 + 產 backup codes
    user.totp_enabled_at = datetime.now(UTC)
    codes = totp.generate_backup_codes()
    await totp.store_backup_codes(db, user_id=user.id, codes=codes)
    await write_audit(
        db, actor=user, action="twofa.enabled",
        target_kind="USER", target_id=user.id, request=request,
    )
    await db.commit()
    logger.info("2fa_enabled", user_id=user.id)
    return ApiResponse[TwoFAEnableOut].ok(TwoFAEnableOut(backup_codes=codes))


@router.post(
    "/disable",
    response_model=ApiResponse[TwoFAOkOut],
    dependencies=[Depends(rate_limit("2fa_verify", limit=10, window=300))],
)
async def disable_2fa(
    payload: TwoFACodeIn,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[TwoFAOkOut]:
    """驗 code(或 backup code) → 清掉 secret + backup codes。"""
    if user.totp_enabled_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "twofa.notEnabled"},
        )
    secret = await totp.decrypt_user_secret(
        db, ciphertext_b64=user.totp_secret_enc or "",
        key_version=user.totp_key_version or 1,
    )
    code_ok = totp.verify_code(secret, payload.code)
    if not code_ok:
        # 也允許 backup code(disable 時用戶可能 totp 機掛了)
        backup_ok = await totp.consume_backup_code(db, user_id=user.id, code=payload.code)
        if not backup_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "twofa.invalidCode"},
            )

    user.totp_secret_enc = None
    user.totp_key_version = None
    user.totp_enabled_at = None
    await db.execute(delete(TotpBackupCode).where(TotpBackupCode.user_id == user.id))
    await write_audit(
        db, actor=user, action="twofa.disabled",
        target_kind="USER", target_id=user.id, request=request,
    )
    await db.commit()
    logger.info("2fa_disabled", user_id=user.id)
    return ApiResponse[TwoFAOkOut].ok(TwoFAOkOut())
