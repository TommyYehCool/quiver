"""
Mock yield protocol — 模擬一個 8% APY 的 USDT lender。

用在 dev / test 環境,讓我們不需要真錢就能跑完整 EarnService 流程。
時鐘可以人為快轉(`advance_time(days=30)`)。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.services.earn.interface import ProtocolPosition, ProtocolStats, YieldProtocol


@dataclass
class MockSupply:
    """單一 owner 在這個 mock 協議的部位狀態。"""

    principal: Decimal  # 累計存入的 USDT 本金(扣除已贖回)
    deposited_at: datetime  # 第一次入金時間
    last_settled_at: datetime  # 上次 settle 利息的時間


class MockYieldProtocol(YieldProtocol):
    """In-memory mock yield protocol。完全不上鏈。"""

    name: str = "Mock(JustLend)"
    chain: str = "mock-tron"

    def __init__(self, *, apy: Decimal = Decimal("0.08")) -> None:
        self._apy = apy
        self._positions: dict[str, MockSupply] = {}
        # 假時鐘,可以快轉
        self._fake_now: datetime = datetime.now(UTC)
        # tx hash counter,讓 e2e test 看得出順序
        self._tx_counter = 0

    # ----- Helpers (test only) -----

    def advance_time(self, days: float = 0, hours: float = 0, seconds: float = 0) -> None:
        """快轉假時鐘,讓 mock 利息可被「累積」。"""
        delta = timedelta(days=days, hours=hours, seconds=seconds)
        self._fake_now += delta

    def now(self) -> datetime:
        return self._fake_now

    def reset(self) -> None:
        self._positions.clear()
        self._fake_now = datetime.now(UTC)
        self._tx_counter = 0

    def _next_tx(self, prefix: str) -> str:
        self._tx_counter += 1
        return f"mock_{prefix}_{self._tx_counter:04d}"

    # ----- YieldProtocol impl -----

    async def get_stats(self) -> ProtocolStats:
        total_tvl = sum(
            (s.principal for s in self._positions.values()),
            start=Decimal(0),
        )
        return ProtocolStats(
            name=self.name,
            chain=self.chain,
            underlying_symbol="USDT",
            apy=self._apy,
            tvl_underlying=total_tvl,
            utilization=Decimal("0.50"),  # 假設 50% 借出
            audited=True,
            last_incident_iso=None,
            notes="Mock protocol — 不上鏈,只供測試",
        )

    async def supply(
        self,
        *,
        owner_address: str,
        owner_priv_hex: str,  # noqa: ARG002 — mock 不用簽名
        amount_underlying: Decimal,
    ) -> str:
        if amount_underlying <= 0:
            raise ValueError("amount must be > 0")

        existing = self._positions.get(owner_address)
        if existing is None:
            self._positions[owner_address] = MockSupply(
                principal=amount_underlying,
                deposited_at=self._fake_now,
                last_settled_at=self._fake_now,
            )
        else:
            # 加碼:先把利息結算到 principal,再加新的本金
            interest = self._calc_interest_since(existing)
            existing.principal += interest + amount_underlying
            existing.last_settled_at = self._fake_now
        return self._next_tx("supply")

    async def redeem_underlying(
        self,
        *,
        owner_address: str,
        owner_priv_hex: str,  # noqa: ARG002
        amount_underlying: Decimal,
    ) -> str:
        if amount_underlying <= 0:
            raise ValueError("amount must be > 0")

        pos = self._positions.get(owner_address)
        if pos is None:
            raise ValueError(f"no position for {owner_address}")

        # 結算到當下的當前價值
        current_value = pos.principal + self._calc_interest_since(pos)
        if amount_underlying > current_value:
            raise ValueError(
                f"redeem {amount_underlying} > current value {current_value}"
            )

        # 結算後 principal = 剩餘部分
        pos.principal = current_value - amount_underlying
        pos.last_settled_at = self._fake_now

        if pos.principal <= Decimal("0.000001"):
            # 完全贖回,清掉 position
            del self._positions[owner_address]

        return self._next_tx("redeem")

    async def get_position(self, *, owner_address: str) -> ProtocolPosition | None:
        pos = self._positions.get(owner_address)
        if pos is None:
            return None
        interest = self._calc_interest_since(pos)
        current_value = pos.principal + interest
        return ProtocolPosition(
            protocol_name=self.name,
            owner_address=owner_address,
            principal_underlying=pos.principal,
            current_value_underlying=current_value,
            interest_accrued=interest,
            deposited_at_iso=pos.deposited_at.isoformat(),
        )

    # ----- private -----

    def _calc_interest_since(self, pos: MockSupply) -> Decimal:
        """從 last_settled_at 到 now 的線性利息(簡化模型)。"""
        elapsed = (self._fake_now - pos.last_settled_at).total_seconds()
        years = Decimal(str(elapsed / 31_536_000))  # 365 day year
        return pos.principal * self._apy * years
