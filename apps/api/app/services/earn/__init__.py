"""
Quiver Earn — DeFi yield aggregation service.

PoC scope (Phase 2):
- abstract `YieldProtocol` interface
- `MockYieldProtocol` for local dev / unit tests
- `EarnService` facade(deposit / withdraw / settle)— handles
  the platform-level concerns(perf fee, accounting, position tracking)

Production extensions(Phase 3+):
- `JustLendProtocol` real mainnet implementation
- ledger-backed position table(replace in-memory dict)
- multi-protocol auto-rebalance
"""

from app.services.earn.interface import YieldProtocol, ProtocolStats, ProtocolPosition
from app.services.earn.mock import MockYieldProtocol
from app.services.earn.service import EarnService, DepositResult, WithdrawResult

__all__ = [
    "DepositResult",
    "EarnService",
    "MockYieldProtocol",
    "ProtocolPosition",
    "ProtocolStats",
    "WithdrawResult",
    "YieldProtocol",
]
