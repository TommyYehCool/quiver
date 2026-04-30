"""Webhook request schemas。

Tatum 真實 payload 比較複雜,Phase 3C-1 先用簡化版做 mock。
Phase 3C-2 接真 Tatum 時會擴充。
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class TatumWebhookIn(BaseModel):
    """Tatum ADDRESS_TRANSACTION 通知的欄位。

    Tron 鏈上的真實 payload 形狀(實測):
      address, amount, counterAddress, asset, blockNumber, txId, type, tokenId, chain, subscriptionType

    `type` 在 Tron 是 "native"(TRX)或 "trc20"(代幣)。
    `tokenId` 對 trc20 是合約地址,native 則為 null。
    """

    txId: str = Field(min_length=10, max_length=80)
    address: str = Field(min_length=34, max_length=34)
    amount: Decimal
    asset: str | None = None
    blockNumber: int | None = None
    counterAddress: str | None = None
    type: str | None = None
    tokenId: str | None = None
    chain: str | None = None
    subscriptionType: str | None = None


class WebhookAck(BaseModel):
    """通用 webhook 回應 — Tatum 看到 200 就停止 retry。"""

    received: bool = True
    onchain_tx_id: int | None = None
    note: str | None = None
