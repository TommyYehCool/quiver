"""User account self-service endpoints — phase 6E-1。

- 列出 / 撤銷登入裝置
- 個資匯出(GDPR / 個資法)
- 刪除帳號申請(等 admin 審核)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update

from app.api.deps import CurrentJtiDep, CurrentUserDep, DbDep
from app.core.logging import get_logger
from app.models.kyc import KycSubmission
from app.models.ledger import Account, AccountKind, LedgerEntry, LedgerTransaction
from app.models.login_session import LoginSession
from app.models.user import User
from app.models.withdrawal import WithdrawalRequest
from app.schemas.api import ApiResponse
from app.services.audit import write_audit

router = APIRouter(prefix="/api/me", tags=["account"])
logger = get_logger(__name__)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ip: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None
    is_current: bool


class SessionsListOut(BaseModel):
    items: list[SessionOut]


class RevokeResultOut(BaseModel):
    revoked: int


class DeletionRequestOut(BaseModel):
    requested_at: datetime | None
    completed_at: datetime | None


# 當前的 TOS / Privacy 版本字串。改版時 bump 一次,所有人重新同意。
TOS_CURRENT_VERSION = "2026-05-04-v2"
# 2026-05-04-v2 (F-4d): added clauses 8-11 covering Quiver Earn (Bitfinex
# integration), performance fees (5% Friend / 15% Public, 0% Premium),
# referral revshare (10% L1 / 5% L2 over 6 months), and Premium subscription
# ($9.99/mo, 7-day grace period). Existing users will see TosGate modal on
# next page load and must re-accept.


class TosStatusOut(BaseModel):
    accepted_at: datetime | None
    accepted_version: str | None
    current_version: str = TOS_CURRENT_VERSION
    needs_acceptance: bool


class TosAcceptIn(BaseModel):
    version: str  # 必須 = TOS_CURRENT_VERSION,避免 client cache 同意舊版


# ---------- sessions ----------


@router.get("/sessions", response_model=ApiResponse[SessionsListOut])
async def list_sessions(
    user: CurrentUserDep,
    current_jti: CurrentJtiDep,
    db: DbDep,
) -> ApiResponse[SessionsListOut]:
    """列出當前用戶最近 50 個 login session(active 在前)。"""
    q = await db.execute(
        select(LoginSession)
        .where(LoginSession.user_id == user.id)
        .order_by(LoginSession.revoked_at.is_(None).desc(), LoginSession.last_seen_at.desc())
        .limit(50)
    )
    items = []
    for s in q.scalars().all():
        items.append(
            SessionOut(
                id=s.id,
                ip=s.ip,
                user_agent=s.user_agent,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                revoked_at=s.revoked_at,
                is_current=(s.jti == current_jti),
            )
        )
    return ApiResponse[SessionsListOut].ok(SessionsListOut(items=items))


@router.post("/sessions/revoke-others", response_model=ApiResponse[RevokeResultOut])
async def revoke_other_sessions(
    request: Request,
    user: CurrentUserDep,
    current_jti: CurrentJtiDep,
    db: DbDep,
) -> ApiResponse[RevokeResultOut]:
    """登出所有其他裝置 — 保留當前 session,其餘 revoke。"""
    where = [
        LoginSession.user_id == user.id,
        LoginSession.revoked_at.is_(None),
    ]
    if current_jti:
        where.append(LoginSession.jti != current_jti)

    result = await db.execute(
        update(LoginSession).where(*where).values(revoked_at=datetime.now(UTC))
    )
    revoked = result.rowcount or 0
    await write_audit(
        db, actor=user, action="sessions.revoke_others",
        target_kind="USER", target_id=user.id,
        payload={"revoked": revoked},
        request=request,
    )
    await db.commit()
    logger.info("sessions_revoke_others", user_id=user.id, revoked=revoked)
    return ApiResponse[RevokeResultOut].ok(RevokeResultOut(revoked=revoked))


# ---------- data export ----------


def _decimal_default(o: Any) -> Any:
    if isinstance(o, Decimal):
        return str(o)
    if isinstance(o, datetime):
        return o.isoformat()
    raise TypeError(f"not serializable: {type(o)}")


@router.get("/export")
async def export_my_data(user: CurrentUserDep, db: DbDep) -> Response:
    """匯出個資為 JSON 下載 — 個資法第 10 條「請求閱覽 / 給予複本」。

    包含:profile + KYC submissions metadata + ledger entries + withdrawals。
    不包含:KYC 照片本體(避免 file 過大,需要請聯絡客服)。
    """
    # profile
    profile = {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "provider": user.provider,
        "roles": list(user.roles),
        "status": user.status,
        "locale": user.locale,
        "tron_address": user.tron_address,
        "created_at": user.created_at.isoformat(),
    }

    # KYC submissions (no file blobs, just metadata)
    kyc_q = await db.execute(
        select(KycSubmission).where(KycSubmission.user_id == user.id).order_by(KycSubmission.id)
    )
    kyc_items = [
        {
            "id": k.id,
            "status": k.status,
            "legal_name": k.legal_name,
            "id_number": "***" + (k.id_number[-4:] if k.id_number else ""),
            "country": k.country,
            "reject_reason": k.reject_reason,
            "reviewed_at": k.reviewed_at.isoformat() if k.reviewed_at else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        }
        for k in kyc_q.scalars().all()
    ]

    # ledger entries
    acct_q = await db.execute(
        select(Account.id).where(
            Account.user_id == user.id,
            Account.kind == AccountKind.USER.value,
        )
    )
    acct_ids = [r[0] for r in acct_q.all()]
    entries_items: list[dict[str, Any]] = []
    if acct_ids:
        ent_q = await db.execute(
            select(LedgerEntry, LedgerTransaction)
            .join(LedgerTransaction, LedgerEntry.ledger_tx_id == LedgerTransaction.id)
            .where(LedgerEntry.account_id.in_(acct_ids))
            .order_by(LedgerEntry.id)
        )
        for entry, tx in ent_q.all():
            entries_items.append({
                "id": entry.id,
                "ledger_tx_id": tx.id,
                "tx_type": tx.type,
                "tx_status": tx.status,
                "tx_note": tx.note,
                "direction": entry.direction,
                "amount": entry.amount,
                "currency": entry.currency,
                "created_at": entry.created_at,
            })

    # withdrawals
    wd_q = await db.execute(
        select(WithdrawalRequest).where(WithdrawalRequest.user_id == user.id).order_by(WithdrawalRequest.id)
    )
    wds_items = [
        {
            "id": w.id,
            "amount": w.amount,
            "fee": w.fee,
            "currency": w.currency,
            "to_address": w.to_address,
            "status": w.status,
            "tx_hash": w.tx_hash,
            "reject_reason": w.reject_reason,
            "created_at": w.created_at,
            "completed_at": w.completed_at,
        }
        for w in wd_q.scalars().all()
    ]

    body = {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": profile,
        "kyc_submissions": kyc_items,
        "ledger_entries": entries_items,
        "withdrawals": wds_items,
    }

    payload = json.dumps(body, ensure_ascii=False, indent=2, default=_decimal_default)
    filename = f"quiver-export-{user.id}-{datetime.now(UTC).strftime('%Y%m%d')}.json"
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- deletion request ----------


@router.post("/deletion-request", response_model=ApiResponse[DeletionRequestOut])
async def request_account_deletion(
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[DeletionRequestOut]:
    """提出帳號刪除申請 — 等 admin 審核後才真的刪。

    為什麼不立即刪:
    - 必須先確認餘額 = 0(否則用戶會喪失資產)
    - 法遵需保留交易紀錄 N 年(soft delete:status SUSPENDED + email 改寫)
    """
    if user.deletion_requested_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "account.deletionAlreadyRequested"},
        )

    user.deletion_requested_at = datetime.now(UTC)
    await write_audit(
        db, actor=user, action="account.deletion_request",
        target_kind="USER", target_id=user.id,
        request=request,
    )
    await db.commit()
    logger.info("account_deletion_requested", user_id=user.id)
    return ApiResponse[DeletionRequestOut].ok(
        DeletionRequestOut(
            requested_at=user.deletion_requested_at,
            completed_at=user.deletion_completed_at,
        )
    )


@router.delete("/deletion-request", response_model=ApiResponse[DeletionRequestOut])
async def cancel_deletion_request(
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[DeletionRequestOut]:
    """取消刪除申請(只有還沒被 admin 完成才能取消)。"""
    if user.deletion_requested_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "account.noDeletionRequest"},
        )
    if user.deletion_completed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "account.deletionAlreadyCompleted"},
        )
    user.deletion_requested_at = None
    await write_audit(
        db, actor=user, action="account.deletion_cancel",
        target_kind="USER", target_id=user.id,
        request=request,
    )
    await db.commit()
    logger.info("account_deletion_cancelled", user_id=user.id)
    return ApiResponse[DeletionRequestOut].ok(
        DeletionRequestOut(requested_at=None, completed_at=None)
    )


@router.get("/deletion-request", response_model=ApiResponse[DeletionRequestOut])
async def get_deletion_request_status(user: CurrentUserDep) -> ApiResponse[DeletionRequestOut]:
    return ApiResponse[DeletionRequestOut].ok(
        DeletionRequestOut(
            requested_at=user.deletion_requested_at,
            completed_at=user.deletion_completed_at,
        )
    )


# ---------- TOS / Privacy ----------


@router.get("/tos", response_model=ApiResponse[TosStatusOut])
async def get_tos_status(user: CurrentUserDep) -> ApiResponse[TosStatusOut]:
    needs = user.tos_version != TOS_CURRENT_VERSION
    return ApiResponse[TosStatusOut].ok(
        TosStatusOut(
            accepted_at=user.tos_accepted_at,
            accepted_version=user.tos_version,
            current_version=TOS_CURRENT_VERSION,
            needs_acceptance=needs,
        )
    )


@router.post("/tos", response_model=ApiResponse[TosStatusOut])
async def accept_tos(
    payload: TosAcceptIn,
    request: Request,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[TosStatusOut]:
    if payload.version != TOS_CURRENT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "tos.versionMismatch",
                "params": {"expected": TOS_CURRENT_VERSION, "got": payload.version},
            },
        )
    user.tos_accepted_at = datetime.now(UTC)
    user.tos_version = TOS_CURRENT_VERSION
    await write_audit(
        db, actor=user, action="account.tos_accept",
        target_kind="USER", target_id=user.id,
        payload={"version": TOS_CURRENT_VERSION},
        request=request,
    )
    await db.commit()
    return ApiResponse[TosStatusOut].ok(
        TosStatusOut(
            accepted_at=user.tos_accepted_at,
            accepted_version=user.tos_version,
            current_version=TOS_CURRENT_VERSION,
            needs_acceptance=False,
        )
    )
