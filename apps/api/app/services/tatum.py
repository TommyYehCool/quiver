"""Tatum API client — Tron 鏈相關呼叫。

只實作 Phase 3C 需要的 endpoints:
- subscription CRUD(訂閱地址收款通知)
- tron/info(取得當前 block height,計算 confirmations)
- tron/transaction/{hash}(查 tx 細節,確認 block_number)

env 自動切 testnet/mainnet api key(`settings.tatum_api_key` property)。
key 為空時所有方法 raise TatumNotConfigured —上層 catch 後決定要 skip 還是報錯。
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TATUM_TRON_CHAIN = "TRON"  # 不分 testnet/mainnet,Tatum 用 api key 區分
DEFAULT_TIMEOUT = 15.0


class TatumError(Exception):
    """Tatum API call 失敗。"""


class TatumNotConfigured(TatumError):
    """環境沒設 TATUM_API_KEY_*。"""


def _api_key() -> str:
    key = settings.tatum_api_key.get_secret_value()
    if not key:
        raise TatumNotConfigured(
            f"TATUM_API_KEY for env={settings.env} is empty — set in .env"
        )
    return key


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.tatum_base_url,
        headers={"x-api-key": _api_key(), "Content-Type": "application/json"},
        timeout=DEFAULT_TIMEOUT,
    )


# ---------- subscriptions ----------


async def create_address_subscription(address: str, callback_url: str) -> str:
    """建立 ADDRESS_TRANSACTION 訂閱,回傳 subscription id。"""
    payload = {
        "type": "ADDRESS_TRANSACTION",
        "attr": {
            "address": address,
            "chain": TATUM_TRON_CHAIN,
            "url": callback_url,
        },
    }
    async with _client() as client:
        res = await client.post("/v3/subscription", json=payload)
    if res.status_code >= 400:
        logger.error("tatum_subscribe_failed", status=res.status_code, body=res.text[:500])
        raise TatumError(f"create_subscription failed: {res.status_code} {res.text[:200]}")
    body = res.json()
    sub_id = body.get("id")
    if not sub_id:
        raise TatumError(f"create_subscription returned no id: {body}")
    logger.info("tatum_subscribed", address=address, sub_id=sub_id)
    return sub_id


async def delete_subscription(sub_id: str) -> bool:
    """刪除一筆訂閱。回 True 即刪除成功(204)或本來就不存在(404)。"""
    async with _client() as client:
        res = await client.delete(f"/v3/subscription/{sub_id}")
    if res.status_code in (200, 204, 404):
        logger.info("tatum_unsubscribed", sub_id=sub_id, status=res.status_code)
        return True
    logger.warning("tatum_unsubscribe_failed", sub_id=sub_id, status=res.status_code, body=res.text[:300])
    return False


async def list_subscriptions(page_size: int = 50) -> list[dict[str, Any]]:
    async with _client() as client:
        res = await client.get(f"/v3/subscription?pageSize={page_size}")
    if res.status_code >= 400:
        raise TatumError(f"list_subscriptions failed: {res.status_code}")
    return res.json()  # type: ignore[no-any-return]


# ---------- tron chain info ----------


async def get_tron_block_number() -> int:
    """目前 Tron block height。"""
    async with _client() as client:
        res = await client.get("/v3/tron/info")
    if res.status_code >= 400:
        raise TatumError(f"get_tron_info failed: {res.status_code}")
    body = res.json()
    block = body.get("blockNumber")
    if not isinstance(block, int):
        raise TatumError(f"get_tron_info: unexpected blockNumber: {body}")
    return block


async def get_tron_transaction(tx_hash: str) -> dict[str, Any] | None:
    """查 Tron tx 細節。404 回 None(可能 tx 還沒上鏈)。"""
    async with _client() as client:
        res = await client.get(f"/v3/tron/transaction/{tx_hash}")
    if res.status_code == 404:
        return None
    if res.status_code >= 400:
        raise TatumError(f"get_tron_transaction failed: {res.status_code}")
    return res.json()  # type: ignore[no-any-return]
