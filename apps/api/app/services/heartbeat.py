"""Cron heartbeat — 寫到 Redis 證明 cron 還活著(phase 6E-5)。

每個 cron task 跑完成功就呼叫 `write_heartbeat(redis, name)`。
另一個 watchdog cron 定期掃 heartbeat,過期 → 寫 sentry alert + log。

Redis key 格式:`hb:cron:<name>` → JSON {"last_at": iso, "expected_interval_s": int}
TTL = expected_interval * 3,過期就消失,watchdog 會抓到。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.core.logging import get_logger

logger = get_logger(__name__)


class _RedisLike(Protocol):
    async def set(self, key: str, value: str, ex: int | None = None) -> object: ...
    async def keys(self, pattern: str) -> list[bytes] | list[str]: ...
    async def get(self, key: str) -> bytes | str | None: ...


@dataclass(frozen=True)
class HeartbeatStatus:
    name: str
    last_at: datetime | None
    expected_interval_s: int
    is_stale: bool


async def write_heartbeat(
    redis: _RedisLike,
    name: str,
    *,
    expected_interval_s: int,
) -> None:
    """成功跑完後寫 heartbeat。"""
    payload = json.dumps(
        {
            "last_at": datetime.now(UTC).isoformat(),
            "expected_interval_s": expected_interval_s,
        }
    )
    # TTL 設成 3 倍 interval — 跳過一次還不算掛,連跳 3 次才報警
    await redis.set(f"hb:cron:{name}", payload, ex=expected_interval_s * 3)


async def check_all_heartbeats(redis: _RedisLike) -> list[HeartbeatStatus]:
    """掃所有 hb:cron:* key 看健康狀況。

    使用方:watchdog 每 N 分鐘呼叫一次,is_stale=True 的去打 Sentry。
    """
    keys = await redis.keys("hb:cron:*")
    statuses: list[HeartbeatStatus] = []
    for raw_key in keys:
        key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
        name = key.removeprefix("hb:cron:")
        raw = await redis.get(key)
        if raw is None:
            statuses.append(
                HeartbeatStatus(
                    name=name, last_at=None, expected_interval_s=0, is_stale=True
                )
            )
            continue
        data = json.loads(raw if isinstance(raw, str) else raw.decode())
        last_at = datetime.fromisoformat(data["last_at"])
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=UTC)
        interval = int(data["expected_interval_s"])
        elapsed = (datetime.now(UTC) - last_at).total_seconds()
        statuses.append(
            HeartbeatStatus(
                name=name,
                last_at=last_at,
                expected_interval_s=interval,
                is_stale=elapsed > interval * 2,
            )
        )
    return statuses


async def watchdog_alert_stale(redis: _RedisLike) -> int:
    """掃 + 對 stale 打 sentry。回傳 stale 數量。"""
    statuses = await check_all_heartbeats(redis)
    stale = [s for s in statuses if s.is_stale]
    if not stale:
        return 0

    try:
        import sentry_sdk

        for s in stale:
            sentry_sdk.capture_message(
                f"cron heartbeat stale: {s.name} (last_at={s.last_at})",
                level="error",
            )
    except ImportError:
        pass  # sentry 沒裝就只 log

    for s in stale:
        logger.error(
            "cron_heartbeat_stale",
            name=s.name,
            last_at=s.last_at.isoformat() if s.last_at else None,
            expected_interval_s=s.expected_interval_s,
        )
    return len(stale)
