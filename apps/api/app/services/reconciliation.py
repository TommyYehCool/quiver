"""每日 03:00 對帳 — 比對 ledger 跟鏈上實際 USDT。

簡化版邏輯:對每個有 tron_address 的 user,直接算 `chain - ledger`。
Phase 6A 的 threshold 是 spec 要求的 0.01 USDT,任何 diff 超過就放進 admin email digest。

注意:目前架構有幾個「合理 diff」的來源,operator 看到後要自己判斷:
1. 內部 TRANSFER 不動鏈,但動 ledger → 收方有 ledger 但鏈上是空的
2. 提領 fee 留在 user 鏈上地址(我們只送 amount,沒送 fee)→ 隨著時間累積
3. In-flight 提領(APPROVED/PROCESSING/BROADCASTING)— ledger 已扣但鏈上還沒
4. PROVISIONAL 入金 — 鏈上已到但 ledger 還沒 POSTED

Phase 6 之後加 sweep + 細分 ledger 才能讓 diff 自然歸零。
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.user import User
from app.services import tatum
from app.services.ledger import get_user_balance
from app.services.tatum import TatumError, TatumNotConfigured

logger = get_logger(__name__)

ALERT_THRESHOLD_USDT = Decimal("0.01")  # spec: 差 > 0.01 USDT 寄信


@dataclass
class UserReconRow:
    user_id: int
    email: str
    address: str
    ledger: Decimal
    chain: Decimal
    diff: Decimal  # chain - ledger
    flagged: bool


@dataclass
class ReconReport:
    rows: list[UserReconRow]
    total_users: int
    flagged_count: int
    error_count: int  # users we couldn't fetch chain balance for


async def run_reconciliation(db: AsyncSession) -> ReconReport:
    """逐一檢查每個有 tron_address 的 user。

    Tatum 任一個 user 失敗不擋整批 — 只 log 並 increment error_count。
    """
    q = await db.execute(select(User).where(User.tron_address.is_not(None)))
    users = q.scalars().all()

    rows: list[UserReconRow] = []
    flagged = 0
    errors = 0

    for u in users:
        ledger = await get_user_balance(db, u.id)
        try:
            chain = await tatum.get_trc20_balance(u.tron_address, settings.usdt_contract)  # type: ignore[arg-type]
        except (TatumError, TatumNotConfigured) as e:
            logger.warning(
                "reconcile_user_chain_fetch_failed",
                user_id=u.id,
                error=str(e),
            )
            errors += 1
            continue

        diff = chain - ledger
        flag = diff.copy_abs() > ALERT_THRESHOLD_USDT
        rows.append(
            UserReconRow(
                user_id=u.id,
                email=u.email,
                address=u.tron_address,  # type: ignore[arg-type]
                ledger=ledger,
                chain=chain,
                diff=diff,
                flagged=flag,
            )
        )
        if flag:
            flagged += 1

    logger.info(
        "reconcile_done",
        total_users=len(users),
        flagged_count=flagged,
        error_count=errors,
    )
    return ReconReport(
        rows=rows,
        total_users=len(users),
        flagged_count=flagged,
        error_count=errors,
    )
