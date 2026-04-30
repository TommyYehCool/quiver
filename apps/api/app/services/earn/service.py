"""
EarnService — 高層 facade,把「協議互動」 + 「平台帳務(perf fee、ledger 寫入)」
包成 deposit / withdraw / settle 三個動作。

PoC 階段沒接 SQLAlchemy / 沒寫 ledger 表,只用 in-memory 紀錄展示流程。
production 化要做的:
  1. 加 schema:`earn_user_positions(user_id, protocol_name, principal, ...)`
  2. 加 ledger types:EARN_DEPOSIT / EARN_WITHDRAW / EARN_INTEREST / EARN_FEE
  3. 把 in-memory state 換成 DB 寫入
  4. deposit 改 worker(send USDT to HOT → call protocol.supply 都要等鏈上 confirm)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.core.logging import get_logger
from app.services.earn.interface import ProtocolPosition, YieldProtocol

logger = get_logger(__name__)


# 業界標準 perf fee 15%(可調)
DEFAULT_PERFORMANCE_FEE_PCT = Decimal("0.15")


@dataclass
class DepositResult:
    user_id: int
    protocol_name: str
    amount: Decimal
    tx_hash: str


@dataclass
class WithdrawResult:
    user_id: int
    protocol_name: str
    requested_amount: Decimal
    principal_portion: Decimal  # 還回用戶的本金
    interest_portion_gross: Decimal  # 用戶這次贖回對應的 gross 利息
    perf_fee: Decimal  # Quiver 抽走
    user_received: Decimal  # 用戶實拿(principal + interest_after_fee)
    tx_hash: str


@dataclass
class _UserPositionState:
    """每用戶 × 協議的部位帳務狀態(in-memory,production 改 DB)。"""

    principal: Decimal = Decimal(0)  # 用戶累積本金(扣已贖回)


@dataclass
class EarnService:
    """高層 facade。bound to one user(在 production 是 stateless service +
    傳 user_id;PoC 用 dataclass 簡化)。"""

    protocol: YieldProtocol
    perf_fee_pct: Decimal = DEFAULT_PERFORMANCE_FEE_PCT
    # in-memory state:user_id -> position state
    _user_states: dict[int, _UserPositionState] = field(default_factory=dict)

    async def deposit(
        self,
        *,
        user_id: int,
        amount: Decimal,
        owner_address: str,
        owner_priv_hex: str,
    ) -> DepositResult:
        """從用戶 Quiver 餘額拿 amount USDT 部署到協議。

        production 流程:
          1. 鎖 user account ledger
          2. 餘額檢查
          3. 寫 ledger:EARN_DEPOSIT(用戶 user_account 扣 amount,平台 earn_pool +)
          4. 把 amount USDT 從 HOT 簽 supply tx 給協議
          5. 等 broadcast confirmation
          6. 紀錄 user_position.principal += amount

        PoC:跳過 1-3,只做 4-6。
        """
        if amount <= 0:
            raise ValueError("amount must be positive")

        # 直接呼叫協議 supply
        tx_hash = await self.protocol.supply(
            owner_address=owner_address,
            owner_priv_hex=owner_priv_hex,
            amount_underlying=amount,
        )

        # 更新內部 state
        state = self._user_states.setdefault(user_id, _UserPositionState())
        state.principal += amount

        logger.info(
            "earn_deposit",
            user_id=user_id,
            protocol=self.protocol.name,
            amount=str(amount),
            tx_hash=tx_hash,
            principal_after=str(state.principal),
        )
        return DepositResult(
            user_id=user_id,
            protocol_name=self.protocol.name,
            amount=amount,
            tx_hash=tx_hash,
        )

    async def get_position_value(
        self, *, user_id: int, owner_address: str
    ) -> Decimal:
        """從協議查當前部位價值(本金 + 累積利息)。"""
        pos = await self.protocol.get_position(owner_address=owner_address)
        if pos is None:
            return Decimal(0)
        return pos.current_value_underlying

    async def get_accrued_interest(
        self, *, user_id: int, owner_address: str
    ) -> Decimal:
        """從上次 settle 起累積的 gross 利息(尚未 settle 給用戶)。"""
        pos = await self.protocol.get_position(owner_address=owner_address)
        state = self._user_states.get(user_id)
        if pos is None or state is None:
            return Decimal(0)
        # 協議的 principal 在 mock 裡會跟 state.principal 一致(因為兩邊同步)
        return pos.current_value_underlying - state.principal

    async def withdraw(
        self,
        *,
        user_id: int,
        amount: Decimal,
        owner_address: str,
        owner_priv_hex: str,
    ) -> WithdrawResult:
        """從協議贖回 amount USDT。perf fee 在贖回時計算 + 扣下:

        計算邏輯:
          requested:用戶想拿回的 USDT 數量(包含本金 + 利息)
          current_value:協議裡當前總值(本金 + 累積利息)
          accrued_interest = current_value - principal
          principal_portion = min(requested, principal)
          interest_portion_gross = requested - principal_portion
          perf_fee = interest_portion_gross × perf_fee_pct
          user_received = requested - perf_fee

        PoC 流程:
          1. 從協議 redeemUnderlying(requested)
          2. 拿到 requested USDT
          3. 算 perf_fee
          4. (production) ledger:user_account += user_received
                                  earn_fee_account += perf_fee
                                  earn_pool -= requested
          5. 更新 state.principal -= principal_portion
        """
        if amount <= 0:
            raise ValueError("amount must be positive")

        state = self._user_states.get(user_id)
        if state is None or state.principal <= 0:
            raise ValueError(f"no position for user {user_id}")

        # 查當前價值
        pos = await self.protocol.get_position(owner_address=owner_address)
        if pos is None:
            raise ValueError(f"protocol returned no position for {owner_address}")

        current_value = pos.current_value_underlying
        if amount > current_value:
            raise ValueError(
                f"requested {amount} > current value {current_value}"
            )

        # 拆解 principal vs interest
        accrued_interest = current_value - state.principal
        if accrued_interest < 0:
            accrued_interest = Decimal(0)  # 防 rounding negative

        # 用戶贖回 X USDT,X 對應的 principal portion 跟 interest portion 按比例
        ratio = amount / current_value if current_value > 0 else Decimal(0)
        principal_portion = state.principal * ratio
        interest_portion_gross = accrued_interest * ratio

        perf_fee = interest_portion_gross * self.perf_fee_pct
        user_received = amount - perf_fee

        # 從協議贖回
        tx_hash = await self.protocol.redeem_underlying(
            owner_address=owner_address,
            owner_priv_hex=owner_priv_hex,
            amount_underlying=amount,
        )

        # 更新 state(扣本金 portion)
        state.principal -= principal_portion
        if state.principal <= Decimal("0.0000001"):
            del self._user_states[user_id]

        logger.info(
            "earn_withdraw",
            user_id=user_id,
            protocol=self.protocol.name,
            requested=str(amount),
            principal=str(principal_portion),
            interest=str(interest_portion_gross),
            perf_fee=str(perf_fee),
            user_received=str(user_received),
            tx_hash=tx_hash,
        )
        return WithdrawResult(
            user_id=user_id,
            protocol_name=self.protocol.name,
            requested_amount=amount,
            principal_portion=principal_portion,
            interest_portion_gross=interest_portion_gross,
            perf_fee=perf_fee,
            user_received=user_received,
            tx_hash=tx_hash,
        )
