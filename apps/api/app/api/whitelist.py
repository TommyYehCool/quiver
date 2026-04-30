"""提領白名單 endpoints (phase 6E-2)。

設計:
- 加地址有 24hr 冷靜期(activated_at = now + cooldown_hours)
- 啟用「白名單模式」後,只能提領到已 activated 的地址
- 啟用 / 關閉模式本身要 2FA 驗證(若用戶有開 2FA;沒有就允許但記 audit)
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.models.withdrawal_whitelist import WithdrawalWhitelist
from app.schemas.api import ApiResponse
from app.services import totp
from app.services.audit import write_audit

router = APIRouter(prefix="/api/me/withdrawal-whitelist", tags=["account"])
logger = get_logger(__name__)

# Tron Base58 地址,T 開頭 + 33 chars,排除 0/O/I/l
TRON_ADDR_RE = re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$")


class WhitelistEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    address: str
    label: str
    activated_at: datetime
    is_active: bool  # activated_at 已過,且未 removed
    created_at: datetime


class WhitelistListOut(BaseModel):
    items: list[WhitelistEntryOut]
    only_mode: bool
    cooldown_hours: int


class WhitelistAddIn(BaseModel):
    address: str = Field(min_length=34, max_length=34)
    label: str = Field(min_length=1, max_length=100)


class WhitelistModeIn(BaseModel):
    only_mode: bool
    code: str | None = None  # 若用戶有 2FA 必填


class WhitelistOkOut(BaseModel):
    ok: bool = True


def _to_out(w: WithdrawalWhitelist, *, now: datetime) -> WhitelistEntryOut:
    return WhitelistEntryOut(
        id=w.id,
        address=w.address,
        label=w.label,
        activated_at=w.activated_at,
        is_active=(w.removed_at is None and w.activated_at <= now),
        created_at=w.created_at,
    )


@router.get("", response_model=ApiResponse[WhitelistListOut])
async def list_whitelist(user: CurrentUserDep, db: DbDep) -> ApiResponse[WhitelistListOut]:
    q = await db.execute(
        select(WithdrawalWhitelist)
        .where(
            WithdrawalWhitelist.user_id == user.id,
            WithdrawalWhitelist.removed_at.is_(None),
        )
        .order_by(WithdrawalWhitelist.created_at.desc())
    )
    now = datetime.now(UTC)
    items = [_to_out(w, now=now) for w in q.scalars().all()]
    return ApiResponse[WhitelistListOut].ok(
        WhitelistListOut(
            items=items,
            only_mode=user.withdrawal_whitelist_only,
            cooldown_hours=settings.whitelist_cooldown_hours,
        )
    )


@router.post(
    "",
    response_model=ApiResponse[WhitelistEntryOut],
    dependencies=[Depends(rate_limit("whitelist_add", limit=10, window=300))],
)
async def add_whitelist(
    payload: WhitelistAddIn,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[WhitelistEntryOut]:
    if not TRON_ADDR_RE.match(payload.address):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "whitelist.invalidAddress"},
        )
    # 重複(已 active or 冷靜中)就 reject
    dup = await db.execute(
        select(WithdrawalWhitelist).where(
            WithdrawalWhitelist.user_id == user.id,
            WithdrawalWhitelist.address == payload.address,
            WithdrawalWhitelist.removed_at.is_(None),
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "whitelist.duplicate"},
        )

    now = datetime.now(UTC)
    activated_at = now + timedelta(hours=settings.whitelist_cooldown_hours)
    entry = WithdrawalWhitelist(
        user_id=user.id,
        address=payload.address,
        label=payload.label,
        activated_at=activated_at,
    )
    db.add(entry)
    await db.flush()

    await write_audit(
        db, actor=user, action="whitelist.add",
        target_kind="USER", target_id=user.id,
        payload={"address": payload.address, "label": payload.label, "activated_at": activated_at.isoformat()},
        request=request,
    )
    await db.commit()
    return ApiResponse[WhitelistEntryOut].ok(_to_out(entry, now=now))


@router.delete(
    "/{entry_id}",
    response_model=ApiResponse[WhitelistOkOut],
)
async def remove_whitelist(
    entry_id: int,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[WhitelistOkOut]:
    q = await db.execute(
        select(WithdrawalWhitelist).where(
            WithdrawalWhitelist.id == entry_id,
            WithdrawalWhitelist.user_id == user.id,
        )
    )
    entry = q.scalar_one_or_none()
    if entry is None or entry.removed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "whitelist.notFound"},
        )
    entry.removed_at = datetime.now(UTC)
    await write_audit(
        db, actor=user, action="whitelist.remove",
        target_kind="USER", target_id=user.id,
        payload={"address": entry.address, "label": entry.label},
        request=request,
    )
    await db.commit()
    return ApiResponse[WhitelistOkOut].ok(WhitelistOkOut())


@router.post("/mode", response_model=ApiResponse[WhitelistOkOut])
async def toggle_only_mode(
    payload: WhitelistModeIn,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[WhitelistOkOut]:
    """切換「只能提到白名單」模式。若用戶有 2FA,必須先驗 code。"""
    if user.totp_enabled_at is not None:
        if not payload.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "whitelist.codeRequired"},
            )
        secret = await totp.decrypt_user_secret(
            db,
            ciphertext_b64=user.totp_secret_enc or "",
            key_version=user.totp_key_version or 1,
        )
        ok = totp.verify_code(secret, payload.code)
        if not ok:
            ok = await totp.consume_backup_code(db, user_id=user.id, code=payload.code)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "twofa.invalidCode"},
            )

    user.withdrawal_whitelist_only = payload.only_mode
    await write_audit(
        db, actor=user, action="whitelist.mode_toggle",
        target_kind="USER", target_id=user.id,
        payload={"only_mode": payload.only_mode},
        request=request,
    )
    await db.commit()
    return ApiResponse[WhitelistOkOut].ok(WhitelistOkOut())
