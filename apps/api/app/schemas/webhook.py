"""Webhook request schemas。

Tatum 真實 payload 比較複雜,Phase 3C-1 先用簡化版做 mock。
Phase 3C-2 接真 Tatum 時會擴充。
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class TatumWebhookIn(BaseModel):
    """Tatum INCOMING_FUNGIBLE_TX 通知的最小欄位集。

    對應 Tatum 文件:https://docs.tatum.io/docs/notifications/incoming-fungible-transactions
    """

    txId: str = Field(min_length=10, max_length=80)  # Tron tx hash
    address: str = Field(min_length=34, max_length=34)  # 收款地址(我們的用戶之一)
    amount: Decimal
    asset: str = "USDT"
    blockNumber: int | None = None
    counterAddress: str | None = None  # 付款方,記錄用
    type: str | None = None  # Tatum 區分 INCOMING/OUTGOING


class WebhookAck(BaseModel):
    """通用 webhook 回應 — Tatum 看到 200 就停止 retry。"""

    received: bool = True
    onchain_tx_id: int | None = None
    note: str | None = None
