"""Transfer endpoints — 內部互轉 + 收件人 preview。

統一活動歷史 (deposits + transfers) 放在 /api/wallet/history(wallet 視角)。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CurrentUserDep, DbDep, TosAcceptedUserDep
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.schemas.api import ApiResponse
from app.schemas.transfer import (
    RecipientPreviewOut,
    TransferIn,
    TransferOut,
)
from app.services.transfer import (
    TransferError,
    execute_transfer,
    lookup_recipient,
)

router = APIRouter(prefix="/api/transfers", tags=["transfers"])
logger = get_logger(__name__)


@router.get("/recipient", response_model=ApiResponse[RecipientPreviewOut | None])
async def get_recipient_preview(
    email: str,
    user: CurrentUserDep,
    db: DbDep,
) -> ApiResponse[RecipientPreviewOut | None]:
    """給前端 confirm modal 顯示對方資訊用。回 None = 找不到。"""
    preview = await lookup_recipient(db, user, email)
    return ApiResponse[RecipientPreviewOut | None].ok(
        RecipientPreviewOut(
            email=preview.email,
            display_name=preview.display_name,
            kyc_approved=preview.kyc_approved,
            is_self=preview.is_self,
        )
        if preview
        else None
    )


@router.post("", response_model=ApiResponse[TransferOut])
async def post_transfer(
    payload: TransferIn,
    user: TosAcceptedUserDep,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
) -> ApiResponse[TransferOut]:
    try:
        result = await execute_transfer(
            db,
            sender=user,
            recipient_email=str(payload.recipient_email),
            amount=payload.amount,
            note=payload.note,
            totp_code=payload.totp_code,
        )
    except TransferError as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code},
        ) from e

    # 寄通知信給收件人(best-effort,不會擋 transfer)
    await arq.enqueue_job(  # type: ignore[attr-defined]
        "transfer_send_received_email",
        to=result.recipient_email,
        sender_email=user.email,
        sender_display_name=user.display_name,
        amount=str(payload.amount),
        currency="USDT-TRC20",
        note=payload.note,
    )

    return ApiResponse[TransferOut].ok(
        TransferOut(
            ledger_tx_id=result.ledger_tx_id,
            sender_balance_after=result.sender_balance_after,
            recipient_email=result.recipient_email,
        )
    )
