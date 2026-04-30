"""Admin overview KPIs (phase 6E-6 / UX restructure)。

聚合所有 admin 首頁要看的數字,一次回傳避免 frontend 打 N 個 endpoint。
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import CurrentAdminDep, DbDep
from app.core.config import settings
from app.core.logging import get_logger
from app.models.kyc import KycStatus, KycSubmission
from app.models.user import User, UserStatus
from app.models.withdrawal import WithdrawalRequest, WithdrawalStatus
from app.schemas.api import ApiResponse
from app.services import tatum
from app.services.platform_outbound import compute_quota
from app.services.tatum import TatumError, TatumNotConfigured
from app.services.wallet import (
    WalletError,
    get_platform_fee_payer_address,
    get_platform_hot_wallet_address,
)

router = APIRouter(prefix="/api/admin/overview", tags=["admin-overview"])
logger = get_logger(__name__)


class AdminOverviewOut(BaseModel):
    # 用戶
    total_users: int
    active_users: int
    pending_kyc_count: int
    pending_deletion_count: int
    # 提領
    pending_withdrawal_count: int
    pending_withdrawal_amount: Decimal
    # 平台錢包
    hot_usdt_balance: Decimal
    hot_trx_balance: Decimal
    fee_payer_trx_balance: Decimal
    user_balances_total: Decimal
    in_flight_withdrawal_amount: Decimal
    platform_profit: Decimal
    # health 指示
    fee_payer_low: bool
    platform_insolvent: bool


@router.get("", response_model=ApiResponse[AdminOverviewOut])
async def get_admin_overview(_: CurrentAdminDep, db: DbDep) -> ApiResponse[AdminOverviewOut]:
    # 用戶數
    total_users_q = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_q.scalar_one()
    active_users_q = await db.execute(
        select(func.count()).select_from(User).where(User.status == UserStatus.ACTIVE.value)
    )
    active_users = active_users_q.scalar_one()

    # 待審 KYC
    pending_kyc_q = await db.execute(
        select(func.count())
        .select_from(KycSubmission)
        .where(KycSubmission.status == KycStatus.PENDING.value)
    )
    pending_kyc = pending_kyc_q.scalar_one()

    # 待處理刪除申請
    pending_del_q = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.deletion_requested_at.is_not(None), User.deletion_completed_at.is_(None))
    )
    pending_del = pending_del_q.scalar_one()

    # 待審提領
    pending_wd_q = await db.execute(
        select(
            func.count().label("cnt"),
            func.coalesce(func.sum(WithdrawalRequest.amount), 0).label("sum_amt"),
        ).where(WithdrawalRequest.status == WithdrawalStatus.PENDING_REVIEW.value)
    )
    pending_wd = pending_wd_q.one()

    # 平台錢包(透過 service 拿,避免重複邏輯)
    quota = await compute_quota(db)

    fp_trx = Decimal("0")
    try:
        fp_addr = await get_platform_fee_payer_address(db)
        fp_trx = await tatum.get_trx_balance(fp_addr)
    except (WalletError, TatumError, TatumNotConfigured) as e:
        logger.warning("overview_fee_payer_unavailable", error=str(e))

    hot_trx = Decimal("0")
    try:
        hot_addr = await get_platform_hot_wallet_address(db)
        hot_trx = await tatum.get_trx_balance(hot_addr)
    except (WalletError, TatumError, TatumNotConfigured) as e:
        logger.warning("overview_hot_trx_unavailable", error=str(e))

    fee_payer_low = fp_trx < Decimal("100")  # 跟 platform.is_fee_payer_healthy 同 threshold
    platform_insolvent = quota.platform_profit < 0

    return ApiResponse[AdminOverviewOut].ok(
        AdminOverviewOut(
            total_users=total_users,
            active_users=active_users,
            pending_kyc_count=pending_kyc,
            pending_deletion_count=pending_del,
            pending_withdrawal_count=pending_wd.cnt or 0,
            pending_withdrawal_amount=Decimal(pending_wd.sum_amt or 0),
            hot_usdt_balance=quota.hot_usdt_balance,
            hot_trx_balance=hot_trx,
            fee_payer_trx_balance=fp_trx,
            user_balances_total=quota.user_balances_total,
            in_flight_withdrawal_amount=quota.in_flight_withdrawal_amount,
            platform_profit=quota.platform_profit,
            fee_payer_low=fee_payer_low,
            platform_insolvent=platform_insolvent,
        )
    )
