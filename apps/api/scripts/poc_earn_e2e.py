"""
Quiver Earn — PoC Phase 2: e2e test against MockYieldProtocol.

Goals:
- 驗證 EarnService 整套 deposit / accrue / withdraw / perf-fee 邏輯
- 不上鏈、不寫 DB,純邏輯測試

Run:
    docker compose exec api python /app/scripts/poc_earn_e2e.py
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

from app.services.earn import EarnService, MockYieldProtocol


# ALICE 假裝是個 user_id=1 的用戶,有個衍生地址
ALICE_ID = 1
ALICE_ADDR = "TF1MKbVtSLRUtXqZB4G8K27DgHVDUyjgvT"
ALICE_PRIV = "0" * 64  # mock 不簽


def hr(title: str) -> None:
    print(f"\n{'─' * 4} {title} {'─' * 4}")


def fmt(d: Decimal) -> str:
    return f"{d:.6f}"


async def main() -> None:
    print("=" * 60)
    print("Quiver Earn — Phase 2 E2E (Mock Protocol)")
    print("=" * 60)

    protocol = MockYieldProtocol(apy=Decimal("0.08"))  # 假設 8%
    earn = EarnService(protocol=protocol)

    # ────────── Step 1:Alice 存 1000 USDT ──────────
    hr("Step 1: Alice 存 1000 USDT")
    r1 = await earn.deposit(
        user_id=ALICE_ID,
        amount=Decimal("1000"),
        owner_address=ALICE_ADDR,
        owner_priv_hex=ALICE_PRIV,
    )
    print(f"  ✓ tx_hash: {r1.tx_hash}")
    val = await earn.get_position_value(user_id=ALICE_ID, owner_address=ALICE_ADDR)
    interest = await earn.get_accrued_interest(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  position value: {fmt(val)} USDT  (interest: {fmt(interest)})")
    assert val == Decimal("1000"), f"expected 1000, got {val}"

    # ────────── Step 2:快轉 30 天,看利息 ──────────
    hr("Step 2: 快轉 30 天")
    protocol.advance_time(days=30)
    val = await earn.get_position_value(user_id=ALICE_ID, owner_address=ALICE_ADDR)
    interest = await earn.get_accrued_interest(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  position value: {fmt(val)} USDT  (interest: {fmt(interest)})")
    expected_interest = Decimal("1000") * Decimal("0.08") * Decimal("30") / Decimal(
        "365"
    )
    print(f"  expected interest @ 8%/yr × 30/365: {fmt(expected_interest)}")
    assert (
        abs(interest - expected_interest) < Decimal("0.001")
    ), f"interest off: {interest} vs {expected_interest}"

    # ────────── Step 3:Alice 加碼 500 USDT ──────────
    hr("Step 3: Alice 再存 500 USDT(會 settle 之前的利息進本金)")
    r2 = await earn.deposit(
        user_id=ALICE_ID,
        amount=Decimal("500"),
        owner_address=ALICE_ADDR,
        owner_priv_hex=ALICE_PRIV,
    )
    val_after = await earn.get_position_value(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  ✓ tx_hash: {r2.tx_hash}")
    print(f"  position value: {fmt(val_after)} USDT")
    print(f"  expected: 1000 + interest(~6.58) + 500 = {fmt(Decimal('1000') + expected_interest + Decimal('500'))}")

    # ────────── Step 4:再快轉 60 天 ──────────
    hr("Step 4: 再快轉 60 天")
    protocol.advance_time(days=60)
    val = await earn.get_position_value(user_id=ALICE_ID, owner_address=ALICE_ADDR)
    interest_after = await earn.get_accrued_interest(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  position value: {fmt(val)} USDT  (interest: {fmt(interest_after)})")

    # ────────── Step 5:Alice 提一半 ──────────
    hr("Step 5: Alice 提一半部位(perf fee 應該扣 15% 利息)")
    half = val / 2
    r3 = await earn.withdraw(
        user_id=ALICE_ID,
        amount=half,
        owner_address=ALICE_ADDR,
        owner_priv_hex=ALICE_PRIV,
    )
    print(f"  ✓ tx_hash:           {r3.tx_hash}")
    print(f"  Requested:           {fmt(r3.requested_amount)} USDT")
    print(f"  Principal portion:   {fmt(r3.principal_portion)} USDT")
    print(f"  Interest portion:    {fmt(r3.interest_portion_gross)} USDT (gross)")
    print(f"  Perf fee (15%):      {fmt(r3.perf_fee)} USDT")
    print(f"  User received:       {fmt(r3.user_received)} USDT")
    print(f"  Effective fee on req:{(r3.perf_fee / r3.requested_amount * 100):.3f}%")

    expected_perf_fee = r3.interest_portion_gross * Decimal("0.15")
    assert (
        abs(r3.perf_fee - expected_perf_fee) < Decimal("0.0001")
    ), f"perf fee math off: {r3.perf_fee} vs {expected_perf_fee}"
    expected_user = r3.requested_amount - r3.perf_fee
    assert (
        abs(r3.user_received - expected_user) < Decimal("0.0001")
    ), f"user received off: {r3.user_received} vs {expected_user}"
    print(f"  ✓ perf fee + user_received 計算正確")

    # ────────── Step 6:再贖回剩餘部位 ──────────
    hr("Step 6: 提剩餘部位")
    val_remaining = await earn.get_position_value(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  Remaining: {fmt(val_remaining)} USDT")
    if val_remaining > 0:
        r4 = await earn.withdraw(
            user_id=ALICE_ID,
            amount=val_remaining,
            owner_address=ALICE_ADDR,
            owner_priv_hex=ALICE_PRIV,
        )
        print(f"  ✓ tx_hash:        {r4.tx_hash}")
        print(f"  Principal:        {fmt(r4.principal_portion)}")
        print(f"  Interest:         {fmt(r4.interest_portion_gross)}")
        print(f"  Perf fee:         {fmt(r4.perf_fee)}")
        print(f"  User received:    {fmt(r4.user_received)}")

    # ────────── Step 7:Alice 部位完全清空 ──────────
    hr("Step 7: 確認部位已清空")
    final_val = await earn.get_position_value(
        user_id=ALICE_ID, owner_address=ALICE_ADDR
    )
    print(f"  Position value: {fmt(final_val)}")
    pos = await protocol.get_position(owner_address=ALICE_ADDR)
    print(f"  Protocol position: {pos}")
    assert (
        final_val < Decimal("0.001")
    ), f"position should be ~0, got {final_val}"
    print(f"  ✓ 部位已清空")

    # ────────── Summary ──────────
    hr("Summary")
    total_deposited = Decimal("1000") + Decimal("500")
    print(f"  總共入金:                 {fmt(total_deposited)} USDT")
    print(f"  總拿回(本金+淨利息):     {fmt(r3.user_received + (r4.user_received if val_remaining > 0 else Decimal(0)))} USDT")
    total_perf_fee = r3.perf_fee + (r4.perf_fee if val_remaining > 0 else Decimal(0))
    print(f"  Quiver 平台收入(perf):   {fmt(total_perf_fee)} USDT")
    print(f"\n  → 90 天總投資週期(30+60),賺到的 net APY 約:")
    if total_deposited > 0:
        days_held = 30 + 60  # 簡化估算
        gain = (
            r3.user_received
            + (r4.user_received if val_remaining > 0 else Decimal(0))
            - total_deposited
        )
        annualized = (gain / total_deposited) * (Decimal("365") / Decimal(days_held))
        print(f"    {(annualized * 100):.2f}% net APY (gross 8% × 0.85 = ~6.8% 預期)")

    print("\n" + "=" * 60)
    print("✅ All e2e assertions passed.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
