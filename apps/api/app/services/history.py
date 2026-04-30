"""統一活動紀錄 — 入金 + 內部轉帳(進 / 出)。

從用戶角度看時間軸:
- DEPOSIT       入金(POSTED 從 ledger / PROVISIONAL 從 onchain_txs)
- TRANSFER_IN   收到別人轉帳
- TRANSFER_OUT  發送轉帳給別人
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import desc, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import (
    Account,
    AccountKind,
    EntryDirection,
    LedgerEntry,
    LedgerTransaction,
    LedgerTxType,
)
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.models.user import User

ActivityType = Literal["DEPOSIT", "TRANSFER_IN", "TRANSFER_OUT"]


@dataclass
class ActivityItem:
    id: str  # 唯一 key:`d:{onchain_tx_id}` 或 `t:{ledger_tx_id}`
    type: ActivityType
    amount: Decimal
    currency: str
    status: str
    note: str | None = None
    counterparty_email: str | None = None
    counterparty_display_name: str | None = None
    tx_hash: str | None = None
    created_at: datetime = datetime.min  # 排序用


async def list_user_activity(
    db: AsyncSession,
    *,
    user_id: int,
    type_filter: str | None = None,  # "all" | "DEPOSIT" | "TRANSFER" | None
    limit: int = 20,
    offset: int = 0,
    currency: str = "USDT-TRC20",
) -> tuple[list[ActivityItem], int]:
    """回傳 (items, total)。先撈所有再排序 + 切片(phase 4 dataset 還小,簡單版)。"""
    items: list[ActivityItem] = []

    want_deposits = type_filter in (None, "all", "DEPOSIT")
    want_transfers = type_filter in (None, "all", "TRANSFER")

    if want_deposits:
        items.extend(await _deposits(db, user_id, currency))

    if want_transfers:
        items.extend(await _transfers(db, user_id, currency))

    items.sort(key=lambda x: x.created_at, reverse=True)
    total = len(items)
    return items[offset : offset + limit], total


async def _deposits(
    db: AsyncSession, user_id: int, currency: str
) -> list[ActivityItem]:
    """從 onchain_txs 撈(已涵蓋 PROVISIONAL + POSTED;ledger_transactions 的 DEPOSIT 都對應一筆 onchain_tx)。"""
    q = await db.execute(
        select(OnchainTx)
        .where(OnchainTx.user_id == user_id, OnchainTx.currency == currency)
        .order_by(desc(OnchainTx.created_at))
    )
    return [
        ActivityItem(
            id=f"d:{tx.id}",
            type="DEPOSIT",
            amount=tx.amount,
            currency=tx.currency,
            status=tx.status,
            tx_hash=tx.tx_hash,
            created_at=tx.created_at,
        )
        for tx in q.scalars().all()
    ]


async def _transfers(
    db: AsyncSession, user_id: int, currency: str
) -> list[ActivityItem]:
    """從 ledger_transactions WHERE type=TRANSFER 拉,並 join 對方帳戶 + user。

    一筆 transfer 在 ledger_entries 有兩列(DR sender / CR recipient)。
    從目前 user 的角度:
      - 自己那筆是 DEBIT  → TRANSFER_OUT,對方 = CREDIT entry 的 user
      - 自己那筆是 CREDIT → TRANSFER_IN,對方 = DEBIT entry 的 user
    """
    MyEntry = aliased(LedgerEntry, name="my_entry")
    MyAcct = aliased(Account, name="my_acct")
    OtherEntry = aliased(LedgerEntry, name="other_entry")
    OtherAcct = aliased(Account, name="other_acct")
    Counter = aliased(User, name="counter_user")

    stmt = (
        select(
            LedgerTransaction,
            MyEntry.direction.label("my_direction"),
            Counter.email.label("counter_email"),
            Counter.display_name.label("counter_display_name"),
        )
        .join(MyEntry, MyEntry.ledger_tx_id == LedgerTransaction.id)
        .join(MyAcct, MyAcct.id == MyEntry.account_id)
        .join(OtherEntry, (OtherEntry.ledger_tx_id == LedgerTransaction.id) & (OtherEntry.id != MyEntry.id))
        .join(OtherAcct, OtherAcct.id == OtherEntry.account_id)
        .outerjoin(Counter, Counter.id == OtherAcct.user_id)
        .where(
            LedgerTransaction.type == LedgerTxType.TRANSFER.value,
            LedgerTransaction.currency == currency,
            MyAcct.user_id == user_id,
            MyAcct.kind == AccountKind.USER.value,
        )
        .order_by(desc(LedgerTransaction.created_at))
    )
    result = await db.execute(stmt)

    items: list[ActivityItem] = []
    for ltx, my_direction, counter_email, counter_display_name in result.all():
        is_out = my_direction == EntryDirection.DEBIT.value
        items.append(
            ActivityItem(
                id=f"t:{ltx.id}",
                type="TRANSFER_OUT" if is_out else "TRANSFER_IN",
                amount=ltx.amount,
                currency=ltx.currency,
                status=ltx.status,
                note=ltx.note,
                counterparty_email=counter_email,
                counterparty_display_name=counter_display_name,
                created_at=ltx.created_at,
            )
        )
    return items
