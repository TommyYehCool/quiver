"""arq worker 設定。"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron
from sqlalchemy import select

from app.core.config import settings
from app.core.db import db_session
from app.core.logging import configure_logging, get_logger
from app.models.onchain_tx import OnchainTx, OnchainTxStatus
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
from app.services import tatum
from app.services.email import (
    send_kyc_approved,
    send_kyc_rejected,
    send_reconciliation_digest,
    send_transfer_received,
)
from app.services.ledger import post_deposit
from app.services.reconciliation import run_reconciliation
from app.services.sweep import list_sweepable_users, sweep_user_to_hot
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import load_hot_signing_keys, load_user_signing_keys
from app.services.withdrawal import (
    fail_and_reverse_withdrawal,
    mark_broadcasting,
    mark_completed,
    mark_processing,
)

logger = get_logger(__name__)

# Tron 出塊 ~3 秒,規格要求 19 confirmations
REQUIRED_CONFIRMATIONS = 19
TRON_BLOCK_SECONDS = 3

# 提領前要 user 地址有多少 TRX 才送(不夠就從 FEE_PAYER 補足)
WITHDRAWAL_TRX_BUDGET = Decimal("30")


async def noop(ctx: dict[str, Any]) -> str:
    """Placeholder。"""
    return "noop"


async def kyc_send_approved_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
) -> bool:
    return await send_kyc_approved(to=to, display_name=display_name)


async def kyc_send_rejected_email(
    ctx: dict[str, Any],
    *,
    to: str,
    display_name: str | None,
    reason: str,
) -> bool:
    return await send_kyc_rejected(to=to, display_name=display_name, reason=reason)


async def transfer_send_received_email(
    ctx: dict[str, Any],
    *,
    to: str,
    sender_email: str,
    sender_display_name: str | None,
    amount: str,
    currency: str,
    note: str | None,
) -> bool:
    return await send_transfer_received(
        to=to,
        sender_email=sender_email,
        sender_display_name=sender_display_name,
        amount=amount,
        currency=currency,
        note=note,
    )


async def _reschedule_confirm(
    ctx: dict[str, Any], onchain_tx_id: int, defer_seconds: int
) -> None:
    """重排自己,等等再來查。"""
    redis = ctx["redis"]
    await redis.enqueue_job(
        "confirm_onchain_tx",
        onchain_tx_id=onchain_tx_id,
        _defer_by=defer_seconds,
    )


async def confirm_onchain_tx(ctx: dict[str, Any], *, onchain_tx_id: int) -> str:
    """查 Tron 鏈確認情況,夠 19 block 就升 POSTED。

    流程:
      1. 沒 block_number → 從 Tatum 查 tx,還沒上鏈就 retry 10s 後
      2. 拿當前 block height → 算 confirmations
      3. ≥ 19 → post_deposit
      4. < 19 → 重排自己,延遲 = 還缺幾 block × 3 秒 + 5 秒 buffer
      5. Tatum 沒設 / 報錯 → log 並 retry 30s 後
    """
    async with db_session() as session:
        result = await session.execute(select(OnchainTx).where(OnchainTx.id == onchain_tx_id))
        onchain_tx = result.scalar_one_or_none()
        if onchain_tx is None:
            logger.warning("confirm_onchain_tx_not_found", onchain_tx_id=onchain_tx_id)
            return "not_found"
        if onchain_tx.status == OnchainTxStatus.POSTED.value:
            return "already_posted"
        if onchain_tx.status != OnchainTxStatus.PROVISIONAL.value:
            logger.warning(
                "confirm_onchain_tx_unexpected_status",
                onchain_tx_id=onchain_tx_id,
                status=onchain_tx.status,
            )
            return "unexpected_status"

        # ---- block_number 未知 → 從 Tatum 查 tx ----
        if onchain_tx.block_number is None:
            try:
                detail = await tatum.get_tron_transaction(onchain_tx.tx_hash)
            except TatumNotConfigured:
                logger.warning(
                    "confirm_onchain_tx_tatum_not_configured",
                    onchain_tx_id=onchain_tx_id,
                )
                # 沒 Tatum 就維持 PROVISIONAL,要靠 dev simulator 或 admin 手動 post
                return "tatum_not_configured"
            except TatumError as e:
                logger.warning(
                    "confirm_onchain_tx_tatum_get_tx_failed",
                    onchain_tx_id=onchain_tx_id,
                    error=str(e),
                )
                await _reschedule_confirm(ctx, onchain_tx_id, 30)
                return "tatum_error_retry"

            if detail is None or not detail.get("blockNumber"):
                # tx 還沒上鏈,10 秒後再來
                logger.info(
                    "confirm_onchain_tx_tx_not_yet_mined",
                    onchain_tx_id=onchain_tx_id,
                )
                await _reschedule_confirm(ctx, onchain_tx_id, 10)
                return "not_yet_mined"

            onchain_tx.block_number = int(detail["blockNumber"])
            await session.commit()

        # ---- 拿當前 block height,算 confirmations ----
        try:
            current_block = await tatum.get_tron_block_number()
        except TatumNotConfigured:
            return "tatum_not_configured"
        except TatumError as e:
            logger.warning(
                "confirm_onchain_tx_tatum_block_failed",
                onchain_tx_id=onchain_tx_id,
                error=str(e),
            )
            await _reschedule_confirm(ctx, onchain_tx_id, 30)
            return "tatum_error_retry"

        confirmations = max(0, current_block - onchain_tx.block_number)
        onchain_tx.confirmations = confirmations

        if confirmations >= REQUIRED_CONFIRMATIONS:
            await post_deposit(session, onchain_tx)
            logger.info(
                "confirm_onchain_tx_posted",
                onchain_tx_id=onchain_tx_id,
                confirmations=confirmations,
            )
            # 入金 POSTED 後立即排 sweep,把鏈上 USDT 移到 HOT(phase 6D)
            await ctx["redis"].enqueue_job(
                "sweep_user", user_id=onchain_tx.user_id, _defer_by=10
            )
            return "posted"

        await session.commit()

    # 還沒夠 — 算還要等幾秒
    blocks_left = REQUIRED_CONFIRMATIONS - confirmations
    defer = max(15, blocks_left * TRON_BLOCK_SECONDS + 5)
    logger.info(
        "confirm_onchain_tx_waiting",
        onchain_tx_id=onchain_tx_id,
        confirmations=confirmations,
        blocks_left=blocks_left,
        next_check_in=defer,
    )
    await _reschedule_confirm(ctx, onchain_tx_id, defer)
    return f"waiting_{confirmations}"


async def broadcast_withdrawal(ctx: dict[str, Any], *, withdrawal_id: int) -> str:
    """簽 + 廣播提領上鏈(phase 6D 起從 HOT wallet 出,不從 user)。

    流程:
      1. APPROVED → PROCESSING(防止 double-broadcast)
      2. 派生 HOT + FEE_PAYER private keys
      3. 若 HOT TRX 不足 30,從 FEE_PAYER 補足(順便啟用 HOT 帳戶)
      4. 等 TRX top-up 上鏈(~12s)
      5. 預檢:HOT 鏈上 USDT ≥ 提領金額(否則 fail + REVERSE,讓 admin 補資 / 等 sweep)
      6. 從 HOT 送 USDT 到 to_address
      7. 寫 tx_hash + status=BROADCASTING + 排程 confirm_withdrawal
      8. 任何環節 raise → fail_and_reverse_withdrawal

    注意:TRX top-up 必須在 USDT pre-check 之前 — 新 HOT 沒收過 TRX 時,
    Tron 帳戶尚未啟用,Tatum /tron/account/{addr} 會回 403,USDT 餘額查不到 (回 0)。
    先 top-up 一筆 TRX 啟用帳戶後,USDT 餘額才查得到。
    """
    # Step 1: 鎖定 + 改 PROCESSING
    async with db_session() as session:
        req = await mark_processing(session, withdrawal_id)
    if req is None:
        logger.info("broadcast_skipped_not_approved", withdrawal_id=withdrawal_id)
        return "not_approved"

    hot_priv = ""
    fp_priv = ""
    try:
        # Step 2: 拿 HOT + FEE_PAYER keys
        async with db_session() as session:
            hot_addr, hot_priv, fp_addr, fp_priv = await load_hot_signing_keys(session)

        # Step 3-4: HOT 的 TRX top-up if needed (放在 USDT 查餘額之前 — 順便啟用帳戶)
        try:
            hot_trx = await tatum.get_trx_balance(hot_addr)
        except TatumError as e:
            raise RuntimeError(f"hot_get_trx_balance_failed: {e}") from e

        if hot_trx < WITHDRAWAL_TRX_BUDGET:
            top_up_amount = WITHDRAWAL_TRX_BUDGET - hot_trx
            logger.info(
                "withdrawal_hot_trx_top_up",
                withdrawal_id=withdrawal_id,
                hot_addr=hot_addr,
                from_balance=str(hot_trx),
                top_up=str(top_up_amount),
            )
            top_up_hash = await tatum.send_trx(fp_priv, hot_addr, top_up_amount)
            logger.info(
                "withdrawal_hot_trx_top_up_broadcast",
                withdrawal_id=withdrawal_id,
                top_up_tx=top_up_hash,
            )
            await asyncio.sleep(12)

        # Step 5: 預檢 HOT 鏈上 USDT(top-up 後帳戶確定已啟用)
        try:
            hot_usdt = await tatum.get_trc20_balance(hot_addr, settings.usdt_contract)
        except TatumError as e:
            raise RuntimeError(f"hot_balance_check_failed: {e}") from e

        if hot_usdt < req.amount:
            raise RuntimeError(
                f"hot_wallet_insufficient: have {hot_usdt} USDT, need {req.amount}. "
                f"等下次 sweep 或 admin 手動補 USDT 到 HOT。"
            )

        # Step 6: send USDT from HOT
        logger.info(
            "withdrawal_send_usdt_from_hot",
            withdrawal_id=withdrawal_id,
            from_addr=hot_addr,
            to_addr=req.to_address,
            amount=str(req.amount),
        )
        usdt_tx_hash = await tatum.send_trc20(
            hot_priv,
            req.to_address,
            settings.usdt_contract,
            req.amount,
            fee_limit_trx=100,
        )

    except Exception as e:
        logger.exception("withdrawal_broadcast_failed", withdrawal_id=withdrawal_id, error=str(e))
        async with db_session() as session:
            await fail_and_reverse_withdrawal(session, withdrawal_id, f"broadcast: {e}")
        return f"failed:{e}"
    finally:
        # 盡量縮短 priv key 在記憶體的時間
        hot_priv = "0" * 64  # noqa: F841
        fp_priv = "0" * 64  # noqa: F841

    # Step 6: 寫 tx_hash + 排 confirm
    async with db_session() as session:
        await mark_broadcasting(session, withdrawal_id, usdt_tx_hash)

    redis = ctx["redis"]
    await redis.enqueue_job(
        "confirm_withdrawal",
        withdrawal_id=withdrawal_id,
        _defer_by=15,
    )
    logger.info(
        "withdrawal_broadcast_done",
        withdrawal_id=withdrawal_id,
        tx_hash=usdt_tx_hash,
    )
    return f"broadcast:{usdt_tx_hash}"


async def confirm_withdrawal(ctx: dict[str, Any], *, withdrawal_id: int) -> str:
    """polling tx confirmations,夠 19 → COMPLETED。"""
    async with db_session() as session:
        q = await session.execute(
            select(WithdrawalRequest).where(WithdrawalRequest.id == withdrawal_id)
        )
        req = q.scalar_one_or_none()
        if req is None:
            return "not_found"
        if req.status == WithdrawalStatus.COMPLETED.value:
            return "already_completed"
        if req.status != WithdrawalStatus.BROADCASTING.value:
            return f"unexpected_status_{req.status}"
        if not req.tx_hash:
            await fail_and_reverse_withdrawal(session, withdrawal_id, "missing tx_hash")
            return "missing_tx_hash"
        tx_hash = req.tx_hash

    try:
        detail = await tatum.get_tron_transaction(tx_hash)
    except TatumNotConfigured:
        return "tatum_not_configured"
    except TatumError as e:
        logger.warning("confirm_withdrawal_tatum_error", withdrawal_id=withdrawal_id, error=str(e))
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=30
        )
        return "tatum_error_retry"

    if detail is None:
        # 還沒被 Tatum index 到,過 10 秒再來
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=10
        )
        return "tx_not_indexed_yet"

    block_number = detail.get("blockNumber")
    if not block_number:
        # tx pending(尚未上塊)
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=15
        )
        return "tx_pending"

    # 檢查 contract 執行有沒有失敗
    ret = detail.get("ret")
    if isinstance(ret, list) and ret:
        contract_ret = ret[0].get("contractRet", "SUCCESS")
        if contract_ret != "SUCCESS":
            async with db_session() as session:
                await fail_and_reverse_withdrawal(
                    session, withdrawal_id, f"chain ret={contract_ret}"
                )
            return f"chain_failed_{contract_ret}"

    try:
        current_block = await tatum.get_tron_block_number()
    except TatumError as e:
        logger.warning("confirm_withdrawal_block_height_error", error=str(e))
        await ctx["redis"].enqueue_job(
            "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=30
        )
        return "tatum_error_retry"

    confirmations = max(0, current_block - block_number)
    if confirmations >= REQUIRED_CONFIRMATIONS:
        async with db_session() as session:
            await mark_completed(session, withdrawal_id)
        logger.info(
            "withdrawal_completed",
            withdrawal_id=withdrawal_id,
            tx_hash=tx_hash,
            confirmations=confirmations,
        )
        return "completed"

    # 不夠就 reschedule
    blocks_left = REQUIRED_CONFIRMATIONS - confirmations
    defer = max(15, blocks_left * TRON_BLOCK_SECONDS + 5)
    logger.info(
        "withdrawal_waiting_confirmations",
        withdrawal_id=withdrawal_id,
        confirmations=confirmations,
        blocks_left=blocks_left,
        next_check_in=defer,
    )
    await ctx["redis"].enqueue_job(
        "confirm_withdrawal", withdrawal_id=withdrawal_id, _defer_by=defer
    )
    return f"waiting_{confirmations}"


async def sweep_user(ctx: dict[str, Any], *, user_id: int) -> str:
    """掃一個 user 鏈上 USDT 到 HOT。

    F-Phase 3 Path A:sweep 成功後 enqueue auto_lend_dispatcher。dispatcher 自己
    會檢查 user 是否有 active earn_account / auto_lend_enabled / ledger 是否 ≥
    min,沒符合條件會 skip(無副作用),所以這裡可以無條件 enqueue。
    """
    async with db_session() as session:
        result = await sweep_user_to_hot(session, user_id)
    if result.tx_hash:
        await ctx["redis"].enqueue_job(
            "auto_lend_dispatcher", user_id=user_id, _defer_by=10
        )
        return f"swept:{result.swept_amount}:{result.tx_hash}"
    return f"skipped:{result.skipped_reason}"


async def cron_sweep_all(ctx: dict[str, Any]) -> str:
    """每 5 分鐘掃所有 user。實際 sweep 與否看 sweep_user_to_hot 內部 threshold 判斷。"""
    from app.services.heartbeat import write_heartbeat

    async with db_session() as session:
        users = await list_sweepable_users(session)
    redis = ctx["redis"]
    for u in users:
        await redis.enqueue_job("sweep_user", user_id=u.id)
    await write_heartbeat(redis, "sweep_all", expected_interval_s=300)
    logger.info("cron_sweep_dispatched", count=len(users))
    return f"dispatched:{len(users)}"


async def cron_heartbeat_watchdog(ctx: dict[str, Any]) -> str:
    """每 10 分鐘掃 cron heartbeat,stale 就打 Sentry alert。"""
    from app.services.heartbeat import watchdog_alert_stale

    stale = await watchdog_alert_stale(ctx["redis"])
    return f"stale:{stale}"


async def reconcile_balances(ctx: dict[str, Any]) -> str:
    """每日對帳 cron task — 比對 ledger vs 鏈上,差異 > 0.01 USDT 寄信給 admin。"""
    from app.services.heartbeat import write_heartbeat

    async with db_session() as session:
        report = await run_reconciliation(session)

    # 24 小時間隔 — 跑完馬上 heartbeat
    await write_heartbeat(ctx["redis"], "reconcile", expected_interval_s=86400)

    flagged = [r for r in report.rows if r.flagged]
    if not flagged and report.error_count == 0:
        logger.info("reconcile_no_alerts", total=report.total_users)
        return "no_alerts"

    admin_emails = settings.admin_emails
    if not admin_emails:
        logger.warning("reconcile_no_admin_emails_configured")
        return "no_admin_emails"

    flagged_payload = [
        {
            "email": r.email,
            "address": r.address,
            "ledger": str(r.ledger),
            "chain": str(r.chain),
            "diff": str(r.diff),
        }
        for r in flagged
    ]
    await send_reconciliation_digest(
        admin_emails,
        flagged_rows=flagged_payload,
        total_users=report.total_users,
        error_count=report.error_count,
    )
    logger.info(
        "reconcile_digest_sent",
        flagged=len(flagged),
        recipients=len(admin_emails),
    )
    return f"sent:{len(flagged)}"


async def _recover_orphan_withdrawals(ctx: dict[str, Any]) -> None:
    """Worker 啟動時對沒走完的 withdrawal 做安全處理。

    APPROVED:還沒開始,可安全重排 broadcast
    BROADCASTING:已拿到 tx_hash,只是 confirm task 沒跑完 → 重排 confirm 安全
    PROCESSING:worker 在「呼叫 Tatum」過程中 crash。我們不知道是 Tatum 還沒收到、
                還是 Tatum 已上鏈但我們沒寫 tx_hash。**這段必須 admin 人工處理**,
                避免雙花。只 log 警告,等 admin force-fail 或 force-complete。
    """
    redis = ctx["redis"]
    async with db_session() as session:
        q = await session.execute(
            select(WithdrawalRequest).where(
                WithdrawalRequest.status.in_(
                    [
                        WithdrawalStatus.APPROVED.value,
                        WithdrawalStatus.PROCESSING.value,
                        WithdrawalStatus.BROADCASTING.value,
                    ]
                )
            )
        )
        rows = q.scalars().all()

    for req in rows:
        if req.status == WithdrawalStatus.BROADCASTING.value:
            await redis.enqueue_job(
                "confirm_withdrawal", withdrawal_id=req.id, _defer_by=5
            )
            logger.info("orphan_confirm_rescheduled", withdrawal_id=req.id)
        elif req.status == WithdrawalStatus.APPROVED.value:
            await redis.enqueue_job(
                "broadcast_withdrawal", withdrawal_id=req.id, _defer_by=5
            )
            logger.info("orphan_broadcast_rescheduled", withdrawal_id=req.id)
        else:
            # PROCESSING — 不安全自動處理,留給 admin 介入
            logger.warning(
                "orphan_processing_needs_admin",
                withdrawal_id=req.id,
                created_at=str(req.created_at),
                user_id=req.user_id,
            )


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging("DEBUG" if settings.is_dev else "INFO")
    from app.core.sentry import init_sentry
    init_sentry(component="worker")
    get_logger(__name__).info("worker_starting")
    try:
        await _recover_orphan_withdrawals(ctx)
    except Exception as e:
        logger.exception("orphan_recovery_failed", error=str(e))


async def shutdown(ctx: dict[str, Any]) -> None:
    get_logger(__name__).info("worker_stopping")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


class WorkerSettings:
    # Late import to avoid pulling earn deps when worker.py is imported elsewhere.
    from app.services.earn.auto_lend import (
        auto_lend_dispatcher,
        auto_lend_finalizer,
    )

    functions = [
        noop,
        kyc_send_approved_email,
        kyc_send_rejected_email,
        transfer_send_received_email,
        confirm_onchain_tx,
        broadcast_withdrawal,
        confirm_withdrawal,
        reconcile_balances,
        sweep_user,
        cron_sweep_all,
        cron_heartbeat_watchdog,
        auto_lend_dispatcher,
        auto_lend_finalizer,
    ]
    # 每日 03:00 (Asia/Taipei) = 19:00 UTC 跑對帳
    # 每 5 分鐘掃一次 user 地址(phase 6D)
    # 每 10 分鐘檢查 cron 心跳(phase 6E-5)
    cron_jobs = [
        cron(reconcile_balances, hour=19, minute=0, run_at_startup=False),
        cron(
            cron_sweep_all,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            run_at_startup=False,
        ),
        cron(
            cron_heartbeat_watchdog,
            minute={0, 10, 20, 30, 40, 50},
            run_at_startup=False,
        ),
    ]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
