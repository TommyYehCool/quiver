"""每日 sync earn_accounts 部位 → earn_position_snapshots。

對每個 active earn_account:
  1. 找 active Bitfinex connection → 跑 BitfinexFundingAdapter 讀 funding wallet + lent
  2. 找 EVM polygon address → 跑 AaveReader 讀 aToken balance + apr
  3. upsert 一筆當日 snapshot

Sync 不會丟例外給 caller(per-account 失敗只 log),確保一個朋友的 API key 過期
不會擋下其他朋友的 sync。
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.schemas.earn import SyncResultOut
from app.services.earn import aave_reader, repo as earn_repo
from app.services.earn.bitfinex_adapter import BitfinexFundingAdapter

logger = get_logger(__name__)


async def sync_one_account(
    db: AsyncSession, earn_account_id: int, *, snapshot_date: date
) -> SyncResultOut:
    """同步單一 earn_account 部位。返回 SyncResultOut。"""
    account = await earn_repo.get_account_by_id(db, earn_account_id)
    if not account or account.archived_at is not None:
        return SyncResultOut(
            earn_account_id=earn_account_id,
            success=False,
            error="account not found or archived",
        )

    # ── Bitfinex ──
    bf_funding = Decimal(0)
    bf_lent = Decimal(0)
    bf_error: str | None = None
    conn = await earn_repo.get_active_bitfinex_connection(db, earn_account_id)
    if conn:
        try:
            adapter = await BitfinexFundingAdapter.from_connection(db, conn)
            position = await adapter.get_funding_position()
            bf_funding = position.funding_balance
            bf_lent = position.lent_total
        except Exception as e:
            bf_error = str(e)[:200]
            logger.warning(
                "earn_sync_bitfinex_failed",
                earn_account_id=earn_account_id,
                error=bf_error,
            )

    # ── AAVE ──
    aave_balance = Decimal(0)
    aave_apr: Decimal | None = None
    aave_error: str | None = None
    addrs = await earn_repo.list_evm_addresses(db, earn_account_id)
    polygon_addrs = [a for a in addrs if a.chain == "polygon"]
    if polygon_addrs:
        # 每個 polygon address 都讀,加總
        try:
            for addr in polygon_addrs:
                pos = await aave_reader.get_user_position(addr.address)
                aave_balance += pos.atoken_balance
            # 同時讀當前 supply rate(共用 market 資料)
            try:
                supply = await aave_reader.get_supply_info()
                aave_apr = supply.apr
            except Exception:
                pass
        except Exception as e:
            aave_error = str(e)[:200]
            logger.warning(
                "earn_sync_aave_failed",
                earn_account_id=earn_account_id,
                error=aave_error,
            )

    # ── 寫 snapshot ──
    total = bf_funding + bf_lent + aave_balance
    await earn_repo.upsert_snapshot(
        db,
        earn_account_id=earn_account_id,
        snapshot_date=snapshot_date,
        bitfinex_funding_usdt=bf_funding,
        bitfinex_lent_usdt=bf_lent,
        bitfinex_daily_earned=None,  # Phase 1 沒算每日結算(要從歷史 ledger 算,留 D5+)
        aave_polygon_usdt=aave_balance,
        aave_daily_apr=aave_apr,
        total_usdt=total,
    )

    success = bf_error is None and aave_error is None
    error_summary = "; ".join(filter(None, [bf_error, aave_error])) or None

    logger.info(
        "earn_sync_one_done",
        earn_account_id=earn_account_id,
        success=success,
        bf_funding=str(bf_funding),
        bf_lent=str(bf_lent),
        aave=str(aave_balance),
        total=str(total),
    )

    return SyncResultOut(
        earn_account_id=earn_account_id,
        success=success,
        bitfinex_funding_usdt=bf_funding,
        bitfinex_lent_usdt=bf_lent,
        aave_polygon_usdt=aave_balance,
        total_usdt=total,
        error=error_summary,
    )


async def sync_all_accounts(db: AsyncSession) -> list[SyncResultOut]:
    """跑所有 active earn_account 的 sync(給 cron 用)。"""
    today = date.today()
    rows = await earn_repo.list_accounts(db, include_archived=False)
    results: list[SyncResultOut] = []
    for ea, _user in rows:
        r = await sync_one_account(db, ea.id, snapshot_date=today)
        results.append(r)
    return results
