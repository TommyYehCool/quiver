"""Admin withdrawal endpoints — list + approve + reject。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.models.user import User
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
from app.schemas.api import ApiResponse
from app.schemas.withdrawal import (
    AdminWithdrawalOut,
    RejectIn,
    WithdrawalListOut,
)
from app.services.withdrawal import (
    WithdrawalError,
    admin_approve,
    admin_force_fail_processing,
    admin_reject,
)

router = APIRouter(prefix="/api/admin/withdrawals", tags=["admin-withdrawals"])
logger = get_logger(__name__)


def _to_admin_out(req: WithdrawalRequest, user: User) -> AdminWithdrawalOut:
    return AdminWithdrawalOut(
        id=req.id,
        user_id=req.user_id,
        user_email=user.email,
        user_display_name=user.display_name,
        amount=req.amount,
        fee=req.fee,
        currency=req.currency,
        to_address=req.to_address,
        status=req.status,
        tx_hash=req.tx_hash,
        reject_reason=req.reject_reason,
        reviewed_at=req.reviewed_at,
        created_at=req.created_at,
    )


@router.get("", response_model=ApiResponse[WithdrawalListOut])
async def list_withdrawals(
    _: CurrentAdminDep,
    db: DbDep,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ApiResponse[WithdrawalListOut]:
    base_stmt = (
        select(WithdrawalRequest, User)
        .join(User, User.id == WithdrawalRequest.user_id)
    )
    count_stmt = select(func.count()).select_from(WithdrawalRequest)

    if status_filter:
        if status_filter not in {s.value for s in WithdrawalStatus}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "withdrawal.invalidStatus"},
            )
        base_stmt = base_stmt.where(WithdrawalRequest.status == status_filter)
        count_stmt = count_stmt.where(WithdrawalRequest.status == status_filter)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = await db.execute(
        base_stmt.order_by(WithdrawalRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [_to_admin_out(req, usr) for req, usr in rows.all()]
    return ApiResponse[WithdrawalListOut].ok(
        WithdrawalListOut(items=items, total=total, page=page, page_size=page_size)
    )


@router.get("/{withdrawal_id}", response_model=ApiResponse[AdminWithdrawalOut])
async def get_withdrawal(
    withdrawal_id: int,
    _: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[AdminWithdrawalOut]:
    row = await db.execute(
        select(WithdrawalRequest, User)
        .join(User, User.id == WithdrawalRequest.user_id)
        .where(WithdrawalRequest.id == withdrawal_id)
    )
    res = row.one_or_none()
    if res is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "withdrawal.notFound"},
        )
    req, user = res
    return ApiResponse[AdminWithdrawalOut].ok(_to_admin_out(req, user))


@router.post("/{withdrawal_id}/approve", response_model=ApiResponse[AdminWithdrawalOut])
async def approve_withdrawal(
    withdrawal_id: int,
    request: Request,
    admin: CurrentAdminDep,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
) -> ApiResponse[AdminWithdrawalOut]:
    from app.services.audit import write_audit
    try:
        req = await admin_approve(db, admin, withdrawal_id)
    except WithdrawalError as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code},
        ) from e

    await write_audit(
        db,
        actor=admin,
        action="withdrawal.approve",
        target_kind="WITHDRAWAL",
        target_id=req.id,
        payload={"user_id": req.user_id, "amount": str(req.amount), "to": req.to_address},
        request=request,
    )
    await db.commit()

    # 進入 APPROVED → enqueue broadcast
    await arq.enqueue_job(  # type: ignore[attr-defined]
        "broadcast_withdrawal", withdrawal_id=req.id, _defer_by=2
    )

    user_q = await db.execute(select(User).where(User.id == req.user_id))
    user = user_q.scalar_one()
    return ApiResponse[AdminWithdrawalOut].ok(_to_admin_out(req, user))


@router.post("/{withdrawal_id}/reject", response_model=ApiResponse[AdminWithdrawalOut])
async def reject_withdrawal(
    withdrawal_id: int,
    payload: RejectIn,
    request: Request,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[AdminWithdrawalOut]:
    from app.services.audit import write_audit
    try:
        req = await admin_reject(db, admin, withdrawal_id, payload.reason)
    except WithdrawalError as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code},
        ) from e
    await write_audit(
        db,
        actor=admin,
        action="withdrawal.reject",
        target_kind="WITHDRAWAL",
        target_id=req.id,
        payload={"user_id": req.user_id, "amount": str(req.amount), "reason": payload.reason},
        request=request,
    )
    await db.commit()
    user_q = await db.execute(select(User).where(User.id == req.user_id))
    user = user_q.scalar_one()
    return ApiResponse[AdminWithdrawalOut].ok(_to_admin_out(req, user))


@router.post("/{withdrawal_id}/force-fail", response_model=ApiResponse[AdminWithdrawalOut])
async def force_fail_withdrawal(
    withdrawal_id: int,
    payload: RejectIn,  # 共用 reason 欄位
    request: Request,
    admin: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[AdminWithdrawalOut]:
    """卡在 PROCESSING 的 withdrawal,強制標 FAILED + REVERSE。

    使用前 admin 必須先去鏈上 explorer 確認 tx 沒實際送出。
    """
    from app.services.audit import write_audit
    try:
        req = await admin_force_fail_processing(db, admin, withdrawal_id, payload.reason)
    except WithdrawalError as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code},
        ) from e
    await write_audit(
        db,
        actor=admin,
        action="withdrawal.force_fail",
        target_kind="WITHDRAWAL",
        target_id=req.id,
        payload={"user_id": req.user_id, "reason": payload.reason},
        request=request,
    )
    await db.commit()
    user_q = await db.execute(select(User).where(User.id == req.user_id))
    user = user_q.scalar_one()
    return ApiResponse[AdminWithdrawalOut].ok(_to_admin_out(req, user))
