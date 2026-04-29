"""Admin KYC endpoints — 審核流程。

- GET  /api/admin/kyc?status=PENDING&page=1&page_size=20
- GET  /api/admin/kyc/{id}
- POST /api/admin/kyc/{id}/approve
- POST /api/admin/kyc/{id}/reject  body: { reason }
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.models.kyc import KycStatus, KycSubmission
from app.models.user import User
from app.schemas.api import ApiResponse
from app.schemas.kyc import (
    KycAdminDetailOut,
    KycAdminListItem,
    KycListOut,
    KycRejectIn,
)

router = APIRouter(prefix="/api/admin/kyc", tags=["admin-kyc"])
logger = get_logger(__name__)


def _to_list_item(submission: KycSubmission, user: User) -> KycAdminListItem:
    return KycAdminListItem(
        id=submission.id,
        user_id=submission.user_id,
        user_email=user.email,
        user_display_name=user.display_name,
        legal_name=submission.legal_name,
        country=submission.country,
        status=submission.status,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


def _to_detail(submission: KycSubmission, user: User) -> KycAdminDetailOut:
    return KycAdminDetailOut(
        id=submission.id,
        user_id=submission.user_id,
        user_email=user.email,
        user_display_name=user.display_name,
        legal_name=submission.legal_name,
        id_number=submission.id_number,
        birth_date=submission.birth_date,
        country=submission.country,
        has_id_front=bool(submission.id_front_url),
        has_id_back=bool(submission.id_back_url),
        has_selfie=bool(submission.selfie_url),
        has_proof_of_address=bool(submission.proof_of_address_url),
        status=submission.status,
        reject_reason=submission.reject_reason,
        reviewed_by=submission.reviewed_by,
        reviewed_at=submission.reviewed_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


@router.get("", response_model=ApiResponse[KycListOut])
async def list_submissions(
    _: CurrentAdminDep,
    db: DbDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ApiResponse[KycListOut]:
    base_stmt = select(KycSubmission, User).join(User, User.id == KycSubmission.user_id)
    count_stmt = select(func.count()).select_from(KycSubmission)

    if status_filter:
        if status_filter not in {s.value for s in KycStatus}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "kyc.invalidStatus"},
            )
        base_stmt = base_stmt.where(KycSubmission.status == status_filter)
        count_stmt = count_stmt.where(KycSubmission.status == status_filter)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    rows_result = await db.execute(
        base_stmt.order_by(KycSubmission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [_to_list_item(sub, usr) for sub, usr in rows_result.all()]

    return ApiResponse[KycListOut].ok(
        KycListOut(items=items, total=total, page=page, page_size=page_size)
    )


@router.get("/{submission_id}", response_model=ApiResponse[KycAdminDetailOut])
async def get_submission(
    submission_id: int,
    _: CurrentAdminDep,
    db: DbDep,
) -> ApiResponse[KycAdminDetailOut]:
    result = await db.execute(
        select(KycSubmission, User)
        .join(User, User.id == KycSubmission.user_id)
        .where(KycSubmission.id == submission_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "kyc.submissionNotFound"},
        )
    submission, user = row
    return ApiResponse[KycAdminDetailOut].ok(_to_detail(submission, user))


async def _load_pending(db: DbDep, submission_id: int) -> tuple[KycSubmission, User]:
    result = await db.execute(
        select(KycSubmission, User)
        .join(User, User.id == KycSubmission.user_id)
        .where(KycSubmission.id == submission_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "kyc.submissionNotFound"},
        )
    submission, user = row
    if submission.status != KycStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "kyc.alreadyReviewed",
                "params": {"status": submission.status},
            },
        )
    return submission, user


@router.post("/{submission_id}/approve", response_model=ApiResponse[KycAdminDetailOut])
async def approve_submission(
    submission_id: int,
    admin: CurrentAdminDep,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
) -> ApiResponse[KycAdminDetailOut]:
    submission, user = await _load_pending(db, submission_id)
    submission.status = KycStatus.APPROVED.value
    submission.reviewed_by = admin.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.reject_reason = None
    await db.commit()
    await db.refresh(submission)

    await arq.enqueue_job(  # type: ignore[attr-defined]
        "kyc_send_approved_email",
        to=user.email,
        display_name=user.display_name,
    )

    logger.info("kyc_approved", submission_id=submission.id, admin_id=admin.id)
    return ApiResponse[KycAdminDetailOut].ok(_to_detail(submission, user))


@router.post("/{submission_id}/reject", response_model=ApiResponse[KycAdminDetailOut])
async def reject_submission(
    submission_id: int,
    payload: KycRejectIn,
    admin: CurrentAdminDep,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
) -> ApiResponse[KycAdminDetailOut]:
    submission, user = await _load_pending(db, submission_id)
    submission.status = KycStatus.REJECTED.value
    submission.reviewed_by = admin.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.reject_reason = payload.reason
    await db.commit()
    await db.refresh(submission)

    await arq.enqueue_job(  # type: ignore[attr-defined]
        "kyc_send_rejected_email",
        to=user.email,
        display_name=user.display_name,
        reason=payload.reason,
    )

    logger.info(
        "kyc_rejected",
        submission_id=submission.id,
        admin_id=admin.id,
    )
    return ApiResponse[KycAdminDetailOut].ok(_to_detail(submission, user))
