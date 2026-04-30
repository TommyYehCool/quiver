"""KYC user-facing endpoints。

- POST /api/kyc/submissions — multipart 上傳 4 步驟全部資料
- GET  /api/kyc/me — 看自己最新一筆 submission
- GET  /api/kyc/submissions/{id}/files/{which} — 看圖（owner 或 admin）
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep, TosAcceptedUserDep
from app.core.logging import get_logger
from app.models.kyc import KycStatus, KycSubmission
from app.schemas.api import ApiResponse
from app.schemas.kyc import KycSubmissionOut
from app.services.storage import (
    KycFileKind,
    media_type_for,
    resolve_path,
    save_kyc_upload,
)

router = APIRouter(prefix="/api/kyc", tags=["kyc"])
logger = get_logger(__name__)


@router.get("/me", response_model=ApiResponse[KycSubmissionOut | None])
async def get_my_submission(
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[KycSubmissionOut | None]:
    result = await db.execute(
        select(KycSubmission)
        .where(KycSubmission.user_id == user.id)
        .order_by(KycSubmission.id.desc())
        .limit(1)
    )
    submission = result.scalar_one_or_none()
    return ApiResponse[KycSubmissionOut | None].ok(
        KycSubmissionOut.model_validate(submission) if submission else None
    )


@router.post("/submissions", response_model=ApiResponse[KycSubmissionOut])
async def create_submission(
    user: TosAcceptedUserDep,
    db: DbDep,
    legal_name: str = Form(min_length=1, max_length=255),
    id_number: str = Form(min_length=1, max_length=64),
    birth_date: date = Form(),
    country: str = Form(min_length=2, max_length=2),
    id_front: UploadFile = File(),
    id_back: UploadFile = File(),
    selfie: UploadFile = File(),
) -> ApiResponse[KycSubmissionOut]:
    """送出 KYC 全部資料。

    若使用者已有 PENDING 或 APPROVED 的 submission,拒絕重送。REJECTED 可重送。
    """
    existing = await db.execute(
        select(KycSubmission)
        .where(KycSubmission.user_id == user.id)
        .order_by(KycSubmission.id.desc())
        .limit(1)
    )
    last = existing.scalar_one_or_none()
    if last and last.status in (KycStatus.PENDING.value, KycStatus.APPROVED.value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "kyc.alreadySubmitted", "params": {"status": last.status}},
        )

    submission = KycSubmission(
        user_id=user.id,
        legal_name=legal_name,
        id_number=id_number,
        birth_date=birth_date,
        country=country.upper(),
        status=KycStatus.PENDING.value,
    )
    db.add(submission)
    await db.flush()  # 拿到 submission.id

    submission.id_front_url = await save_kyc_upload(submission.id, "id_front", id_front)
    submission.id_back_url = await save_kyc_upload(submission.id, "id_back", id_back)
    submission.selfie_url = await save_kyc_upload(submission.id, "selfie", selfie)

    await db.commit()
    await db.refresh(submission)
    logger.info("kyc_submitted", user_id=user.id, submission_id=submission.id)
    return ApiResponse[KycSubmissionOut].ok(KycSubmissionOut.model_validate(submission))


@router.get("/submissions/{submission_id}/files/{which}")
async def get_submission_file(
    submission_id: int,
    which: str,
    user: CurrentUserDep,
    db: DbDep,
) -> FileResponse:
    """回傳檔案 — owner 或 admin 才能看。"""
    if which not in ("id_front", "id_back", "selfie", "proof_of_address"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "kyc.invalidFileKind"},
        )

    result = await db.execute(
        select(KycSubmission).where(KycSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "kyc.submissionNotFound"},
        )

    if submission.user_id != user.id and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "kyc.forbidden"},
        )

    rel_path: str | None = {
        "id_front": submission.id_front_url,
        "id_back": submission.id_back_url,
        "selfie": submission.selfie_url,
        "proof_of_address": submission.proof_of_address_url,
    }[which]
    if rel_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "kyc.fileNotFound"},
        )

    abs_path = resolve_path(rel_path)
    return FileResponse(abs_path, media_type=media_type_for(rel_path))
