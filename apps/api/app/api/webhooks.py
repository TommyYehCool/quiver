"""Webhooks endpoints — 外部服務(Tatum)打進來的入金通知。

URL 內含 path token 做認證:
  POST /api/webhooks/tatum/{token}

token 來自 env `WEBHOOK_PATH_TOKEN`,跟 Tatum subscription 設定的 callback URL 一致。
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.api.deps import DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.queue import get_arq_pool
from app.schemas.webhook import TatumWebhookIn, WebhookAck
from app.services.onchain import record_provisional_deposit

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
logger = get_logger(__name__)


def _verify_token(token: str) -> None:
    expected = settings.webhook_path_token.get_secret_value()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "webhook.notConfigured"},
        )
    if not secrets.compare_digest(token, expected):
        logger.warning("webhook_token_mismatch")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "webhook.invalidToken"},
        )


@router.post("/tatum/{token}", response_model=WebhookAck)
async def tatum_webhook(
    payload: TatumWebhookIn,
    db: DbDep,
    arq: Annotated[object, Depends(get_arq_pool)],
    token: str = Path(..., min_length=20, max_length=80),
) -> WebhookAck:
    _verify_token(token)

    # Tatum 會同時送 INCOMING / OUTGOING 通知,我們只關心 incoming
    if payload.type and payload.type.upper() not in ("", "INCOMING_FUNGIBLE_TX", "INCOMING"):
        return WebhookAck(received=True, note=f"ignored type={payload.type}")

    onchain_tx = await record_provisional_deposit(
        db,
        tx_hash=payload.txId,
        to_address=payload.address,
        amount=payload.amount,
        currency=f"{payload.asset}-TRC20" if payload.asset else "USDT-TRC20",
        block_number=payload.blockNumber,
        raw_payload=payload.model_dump(mode="json"),
    )

    if onchain_tx is None:
        # 重複通知 / 地址不是我們的 / 0 amount — 都回 200 讓 Tatum 不要 retry
        return WebhookAck(received=True, note="ignored or duplicate")

    # 進入 confirmation 流程 — 直接排程一個 60s 後升 POSTED 的 mock job
    # Phase 3C-2 會改成 polling 真實 block height
    await arq.enqueue_job(  # type: ignore[attr-defined]
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx.id,
        _defer_by=60,  # 60 秒後執行,模擬 19 個 block ≈ 57 秒
    )

    return WebhookAck(received=True, onchain_tx_id=onchain_tx.id)
