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

    # 記下原始 payload 方便 debug(Tatum 真實 payload shape 跟文件描述常有出入)
    logger.info(
        "tatum_webhook_received",
        tx_id=payload.txId,
        type=payload.type,
        asset=payload.asset,
        amount=str(payload.amount),
        token_id=payload.tokenId,
    )

    # 跳過 native TRX(我們只計 USDT-TRC20)— pipeline 驗證可以靠這個 log line
    if payload.type and payload.type.lower() == "native":
        return WebhookAck(received=True, note="ignored_native_trx")

    # 跳過非 USDT 的 TRC20(其他穩定幣 / 一般 token)
    asset_upper = (payload.asset or "").upper()
    if asset_upper and asset_upper != "USDT":
        return WebhookAck(received=True, note=f"ignored_asset_{asset_upper}")

    onchain_tx = await record_provisional_deposit(
        db,
        tx_hash=payload.txId,
        to_address=payload.address,
        amount=payload.amount,
        currency="USDT-TRC20",
        block_number=payload.blockNumber,
        raw_payload=payload.model_dump(mode="json"),
    )

    if onchain_tx is None:
        # 重複通知 / 地址不是我們的 / 0 或負 amount(出帳)— 都回 200 讓 Tatum 不要 retry
        return WebhookAck(received=True, note="ignored_or_duplicate")

    # 排程 confirmation polling — defer 10s 第一輪查(Tron block ~3s,大概等 1-2 個 block 到位)
    await arq.enqueue_job(  # type: ignore[attr-defined]
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx.id,
        _defer_by=10,
    )

    return WebhookAck(received=True, onchain_tx_id=onchain_tx.id)
