"""Tatum API client — Tron 鏈相關呼叫。

只實作 Phase 3C 需要的 endpoints:
- subscription CRUD(訂閱地址收款通知)
- tron/info(取得當前 block height,計算 confirmations)
- tron/transaction/{hash}(查 tx 細節,確認 block_number)
- tron/account/{address}(查 USDT-TRC20 餘額,Phase 3C dashboard 顯示用)

env 自動切 testnet/mainnet api key(`settings.tatum_api_key` property)。
key 為空時所有方法 raise TatumNotConfigured —上層 catch 後決定要 skip 還是報錯。
"""

from __future__ import annotations

from decimal import Decimal
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


# USDT TRC20 用 6 位小數
USDT_DECIMALS = 6


async def get_trx_balance(address: str) -> Decimal:
    """查 Tron 地址的 TRX(原生)餘額。

    Tatum 回 `balance` 是 sun (1 TRX = 1_000_000 sun)。地址沒啟用會回 0。
    """
    async with _client() as client:
        res = await client.get(f"/v3/tron/account/{address}")
    if res.status_code == 403:
        return Decimal("0")
    if res.status_code >= 400:
        raise TatumError(f"get_tron_account failed: {res.status_code}")
    body = res.json()
    raw = body.get("balance", 0)
    return Decimal(raw) / Decimal(1_000_000)


async def get_trc20_balance(address: str, contract: str) -> Decimal:
    """查指定地址在某 TRC20 合約的餘額。

    Tatum 回 `trc20: [{contract: raw_balance_str}, ...]`,raw 是「smallest unit」字串。
    USDT 6 位小數 → 1000000000 = 1000 USDT。

    地址沒在鏈上(沒被啟用 / 找不到)會回 0。
    """
    async with _client() as client:
        res = await client.get(f"/v3/tron/account/{address}")
    if res.status_code == 403:
        # tron.account.not.found — 還沒收到任何 tx,當 0
        return Decimal("0")
    if res.status_code >= 400:
        raise TatumError(f"get_tron_account failed: {res.status_code}")

    body = res.json()
    raw = "0"
    for entry in body.get("trc20", []) or []:
        if isinstance(entry, dict) and contract in entry:
            raw = entry[contract]
            break
    return Decimal(raw) / Decimal(10**USDT_DECIMALS)
