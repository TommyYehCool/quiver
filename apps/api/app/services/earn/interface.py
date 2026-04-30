"""
Abstract YieldProtocol interface.

任何要被 EarnService 拿來部署資金的協議(JustLend、AAVE、Compound、Mock)
都實作這個 interface。EarnService 不關心底層協議,只關心:
- 報出 APY、TVL 等基本資訊
- 把 USDT 送進去(supply)
- 把 USDT 拿出來(redeem)
- 查當前部位價值(本金 + 累積利息)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ProtocolStats:
    """協議當前公開狀態(read-only,從鏈上 / API 抓)。"""

    name: str  # e.g. "JustLend USDT" or "Mock(JustLend)"
    chain: str  # e.g. "tron" / "polygon"
    underlying_symbol: str  # e.g. "USDT"
    apy: Decimal  # 0.08 = 8%
    tvl_underlying: Decimal  # 協議的 underlying token TVL,例如 $250M USDT
    utilization: Decimal  # 0.85 = 85% 的 supply 被借出去
    audited: bool
    last_incident_iso: str | None = None  # "2024-01-15" 或 None
    notes: str | None = None


@dataclass
class ProtocolPosition:
    """單一 owner 在某協議的當前部位。"""

    protocol_name: str
    owner_address: str
    principal_underlying: Decimal  # 從上次 settle 起累積的本金
    current_value_underlying: Decimal  # 鏈上即時值(本金 + 利息)
    interest_accrued: Decimal  # 從 deposited_at 到現在的利息
    deposited_at_iso: str

    @property
    def is_in_profit(self) -> bool:
        return self.current_value_underlying > self.principal_underlying


class YieldProtocol(ABC):
    """所有 yield protocol 實作必須繼承這個。"""

    name: str
    chain: str

    @abstractmethod
    async def get_stats(self) -> ProtocolStats:
        """讀協議當前 APY / TVL / utilization 等公開狀態。"""

    @abstractmethod
    async def supply(
        self,
        *,
        owner_address: str,
        owner_priv_hex: str,
        amount_underlying: Decimal,
    ) -> str:
        """送 USDT 進協議,回 tx_hash。"""

    @abstractmethod
    async def redeem_underlying(
        self,
        *,
        owner_address: str,
        owner_priv_hex: str,
        amount_underlying: Decimal,
    ) -> str:
        """從協議贖回固定數量的 underlying USDT,回 tx_hash。"""

    @abstractmethod
    async def get_position(self, *, owner_address: str) -> ProtocolPosition | None:
        """查 owner_address 在這個協議的當前部位,沒部位回 None。"""
