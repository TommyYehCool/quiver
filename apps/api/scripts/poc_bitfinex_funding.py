"""
Quiver Earn — PoC Phase 3 #2: Bitfinex Funding API authenticated read。

驗證:
- 用 .env 的 BITFINEX_API_KEY / BITFINEX_API_SECRET 走 HMAC-SHA384 認證
- 讀 wallets / funding offers / funding credits / FRR / 帳戶資訊
- 全程 read-only,**不會** submit / cancel / withdraw

API key 應該開:
  ✓ Wallets — Get balances and addresses
  ✓ Margin Funding — Get funding statuses and info
  ✓ Account History — Get historical entries
  ✓ Account Info — Get fee info
  ✗ 任何 write 權限(這支 PoC 都不需要)

Run:
    docker compose exec -T -e PYTHONPATH=/app api python /app/scripts/poc_bitfinex_funding.py
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from decimal import Decimal

import httpx

API_BASE = "https://api.bitfinex.com"
# Bitfinex 用 "UST" 代表 Tether USDT(歷史遺留),不是 "USDT"。
# 但 auth endpoints (offers/credits) 兩個 symbol 都吃,public 只認 fUST。
SYMBOL = "fUST"
SYMBOL_AUTH = "fUSDT"  # auth endpoints 用這個(經測試 fUST 也行,但 fUSDT 是官方文件版)


def get_credentials() -> tuple[str, str]:
    key = os.environ.get("BITFINEX_API_KEY", "").strip()
    secret = os.environ.get("BITFINEX_API_SECRET", "").strip()
    if not key or not secret:
        raise RuntimeError(
            "BITFINEX_API_KEY / BITFINEX_API_SECRET 沒設,檢查 apps/api/.env"
        )
    return key, secret


def auth_post(path: str, body: dict | None = None) -> list | dict:
    """送 authenticated POST。

    簽章: hex(hmac_sha384(secret, '/api/{path}{nonce}{json_body}'))
    參考: https://docs.bitfinex.com/docs/rest-auth
    """
    key, secret = get_credentials()
    nonce = str(int(time.time() * 1000))  # ms 級單調遞增
    body_json = json.dumps(body or {})
    msg = f"/api/{path}{nonce}{body_json}"
    sig = hmac.new(
        secret.encode("utf-8"),
        msg.encode("utf-8"),
        hashlib.sha384,
    ).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "bfx-nonce": nonce,
        "bfx-apikey": key,
        "bfx-signature": sig,
    }
    url = f"{API_BASE}/{path}"
    r = httpx.post(url, headers=headers, content=body_json, timeout=15.0)
    r.raise_for_status()
    return r.json()


def public_get(path: str) -> list | dict:
    """送 public GET(無認證)。"""
    url = f"{API_BASE}/{path}"
    r = httpx.get(url, timeout=15.0)
    r.raise_for_status()
    return r.json()


# ============================================================
# Probes
# ============================================================


def probe_user_info() -> None:
    """讀帳戶基本資訊,確認認證可用。"""
    print("— 帳戶基本資訊(/v2/auth/r/info/user)—")
    try:
        data = auth_post("v2/auth/r/info/user")
        # array 格式,參考 docs: [ID, EMAIL, USERNAME, MTS_ACCOUNT_CREATE, ...]
        user_id = data[0] if len(data) > 0 else None
        email = data[1] if len(data) > 1 else None
        username = data[2] if len(data) > 2 else None
        mts_create = data[3] if len(data) > 3 else None
        verified = data[8] if len(data) > 8 else None
        print(f"  ✓ user_id:    {user_id}")
        # email 部分隱碼
        if email and isinstance(email, str) and "@" in email:
            local, domain = email.split("@", 1)
            email_masked = f"{local[:2]}***@{domain}"
            print(f"  ✓ email:      {email_masked}")
        print(f"  ✓ username:   {username}")
        print(f"  ✓ verified:   {verified}")
        if mts_create:
            from datetime import datetime, timezone
            dt = datetime.fromtimestamp(mts_create / 1000, tz=timezone.utc)
            print(f"  ✓ created:    {dt.isoformat()}")
        print("  ✓ 認證 OK")
    except httpx.HTTPStatusError as e:
        print(f"  ✗ HTTP {e.response.status_code}: {e.response.text}")
        if e.response.status_code == 401:
            print("    → 通常是 API key 權限沒開,或 nonce 不對")
        elif e.response.status_code == 500:
            print("    → 通常是 signature 錯誤(secret 對嗎?)")
        raise
    except Exception as e:
        print(f"  ✗ failed: {e}")
        raise


def probe_wallets() -> None:
    """讀所有 wallets(exchange / margin / funding)。"""
    print("\n— Wallets(/v2/auth/r/wallets)—")
    try:
        data = auth_post("v2/auth/r/wallets")
    except Exception as e:
        print(f"  ✗ failed: {e}")
        return
    if not data:
        print("  (空,沒有任何餘額)")
        return
    print(f"  {'Type':<10} {'Currency':<8} {'Balance':>18}  {'Available':>18}")
    for w in data:
        # [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...]
        wtype = w[0] if len(w) > 0 else "?"
        curr = w[1] if len(w) > 1 else "?"
        bal = Decimal(str(w[2])) if len(w) > 2 and w[2] is not None else Decimal(0)
        avail = (
            Decimal(str(w[4])) if len(w) > 4 and w[4] is not None else Decimal(0)
        )
        # 只列非 0 的
        if bal == 0 and avail == 0:
            continue
        print(f"  {wtype:<10} {curr:<8} {bal:>18.6f}  {avail:>18.6f}")
    # 計算 funding wallet USDT 餘額
    funding_usdt = next(
        (Decimal(str(w[2])) for w in data if w[0] == "funding" and w[1] == "UST"),
        Decimal(0),
    )
    if funding_usdt == 0:
        print(
            "\n  ⚠ Funding wallet 沒有 USDT 餘額。production 上要先把 USDT 從 "
            "Exchange wallet 轉到 Funding wallet 才能 lend。"
        )
    else:
        print(f"\n  → Funding USDT 餘額: {funding_usdt:.6f}")


def probe_funding_offers() -> None:
    """讀 active funding offers(自己掛的)。"""
    print(f"\n— 我的 Active Funding Offers ({SYMBOL_AUTH})(/v2/auth/r/funding/offers/{SYMBOL_AUTH})—")
    try:
        data = auth_post(f"v2/auth/r/funding/offers/{SYMBOL}")
    except Exception as e:
        print(f"  ✗ failed: {e}")
        return
    if not data:
        print("  (沒有 active offer 中)")
        return
    print(f"  共 {len(data)} 筆 active offer:")
    for o in data:
        # [ID, SYMBOL, MTS_CREATE, MTS_UPDATE, AMOUNT, AMOUNT_ORIG, OFFER_TYPE,
        #  _, _, FLAGS, STATUS, _, _, _, RATE, PERIOD, NOTIFY, HIDDEN, _,
        #  RENEW, _]
        offer_id = o[0]
        amount = Decimal(str(o[4]))
        rate_daily = Decimal(str(o[14]))  # 日利率
        rate_apy = rate_daily * 365 * 100
        period = o[15]
        status = o[10]
        print(
            f"  id={offer_id} amt={amount:.4f} "
            f"rate={rate_daily*100:.4f}%/day (~{rate_apy:.2f}% APY) "
            f"period={period}d status={status}"
        )


def probe_funding_credits() -> None:
    """讀已 match 的 funding credits(目前借出去的)。"""
    print(f"\n— 我的 Active Funding Credits ({SYMBOL_AUTH})(/v2/auth/r/funding/credits/{SYMBOL_AUTH})—")
    try:
        data = auth_post(f"v2/auth/r/funding/credits/{SYMBOL}")
    except Exception as e:
        print(f"  ✗ failed: {e}")
        return
    if not data:
        print("  (沒有 active credit,即:目前沒任何 USDT 被借走)")
        return
    print(f"  共 {len(data)} 筆 lent positions:")
    total_amount = Decimal(0)
    for c in data:
        # [ID, SYMBOL, SIDE, MTS_CREATE, MTS_UPDATE, AMOUNT, FLAGS, STATUS,
        #  RATE_TYPE, _, _, RATE, PERIOD, MTS_OPENING, MTS_LAST_PAYOUT,
        #  NOTIFY, HIDDEN, _, RENEW, _, NO_CLOSE, POSITION_PAIR]
        credit_id = c[0]
        amount = Decimal(str(c[5]))
        rate_daily = Decimal(str(c[11]))
        rate_apy = rate_daily * 365 * 100
        period = c[12]
        status = c[7]
        total_amount += amount
        print(
            f"  id={credit_id} amt={amount:.4f} "
            f"rate={rate_daily*100:.4f}%/day (~{rate_apy:.2f}% APY) "
            f"period={period}d status={status}"
        )
    print(f"  → 總 lent: {total_amount:.4f} USDT")


def probe_market_frr() -> None:
    """讀 fUST(=USDT)市場 FRR。

    重要:Bitfinex 公開 API 用 'fUST' 表示 Tether,不是 'fUSDT'。
    auth endpoints 兩個都接受,public ticker 只認 fUST。
    """
    print(f"\n— 公開市場 FRR ({SYMBOL}) —")

    # 試 1: 單一 ticker
    try:
        t = public_get(f"v2/ticker/{SYMBOL}")
        if t and len(t) >= 16:
            # ticker (single): [FRR, BID, BID_PERIOD, BID_SIZE, ASK, ASK_PERIOD,
            #   ASK_SIZE, DAILY_CHG, DAILY_CHG_PERC, LAST_PRICE, VOLUME, HIGH,
            #   LOW, _, _, FRR_AMOUNT_AVAILABLE]
            frr = Decimal(str(t[0]))
            bid = Decimal(str(t[1]))
            ask = Decimal(str(t[4]))
            last = Decimal(str(t[9]))
            frr_amount_avail = Decimal(str(t[15])) if t[15] is not None else Decimal(0)
            print(f"  ✓ 用 /v2/ticker/{SYMBOL}")
            print(f"  FRR (Flash Return Rate): "
                  f"{frr*100:.4f}%/day (~{frr*365*100:.2f}% APY)")
            print(f"  Bid (借方願付最高):       "
                  f"{bid*100:.4f}%/day (~{bid*365*100:.2f}% APY)")
            print(f"  Ask (貸方願收最低):       "
                  f"{ask*100:.4f}%/day (~{ask*365*100:.2f}% APY)")
            print(f"  Last 成交:                "
                  f"{last*100:.4f}%/day (~{last*365*100:.2f}% APY)")
            print(f"  FRR 即可借出量:           "
                  f"{frr_amount_avail:>15,.0f} USDT")
            # 同時給 funding stats(utilization)
            try:
                stats = public_get(f"v2/funding/stats/{SYMBOL}/hist?limit=1")
                if stats and len(stats[0]) > 7:
                    s = stats[0]
                    funding_amount = Decimal(str(s[6]))
                    funding_used = Decimal(str(s[7]))
                    if funding_amount > 0:
                        util = funding_used / funding_amount * 100
                        print(
                            f"  Market util:              {util:.2f}% "
                            f"(borrowed {funding_used/1e6:.0f}M / "
                            f"total {funding_amount/1e6:.0f}M)"
                        )
            except Exception:
                pass
            return
    except Exception as e:
        print(f"  ⚠ ticker {SYMBOL} 失敗: {e}")

    # 試 2: tickers (plural) endpoint
    try:
        result = public_get(f"v2/tickers?symbols={SYMBOL}")
        if result and len(result) > 0:
            t = result[0]
            # tickers 格式: [SYMBOL, FRR, BID, BID_PERIOD, BID_SIZE,
            #                ASK, ASK_PERIOD, ASK_SIZE, DAILY_CHANGE, ...]
            frr = Decimal(str(t[1]))
            bid = Decimal(str(t[2]))
            ask = Decimal(str(t[5]))
            last = Decimal(str(t[10]))
            frr_apy = frr * 365 * 100
            bid_apy = bid * 365 * 100
            ask_apy = ask * 365 * 100
            last_apy = last * 365 * 100
            print(f"  ✓ 用 /v2/tickers fallback")
            print(f"  FRR:                  {frr*100:.4f}%/day  (~{frr_apy:.2f}% APY)")
            print(f"  Bid (借方願付最高):    {bid*100:.4f}%/day  (~{bid_apy:.2f}% APY)")
            print(f"  Ask (貸方願收最低):    {ask*100:.4f}%/day  (~{ask_apy:.2f}% APY)")
            print(f"  Last 成交:             {last*100:.4f}%/day  (~{last_apy:.2f}% APY)")
            return
    except Exception as e:
        print(f"  ⚠ tickers fallback 失敗: {e}")

    # 試 2: funding stats hist
    try:
        stats = public_get(f"v2/funding/stats/{SYMBOL}/hist?limit=1")
        if stats:
            # [MTS, _, FRR, AVG_PERIOD, _, _, FUNDING_AMOUNT, FUNDING_AMOUNT_USED, ...]
            s = stats[0]
            frr = Decimal(str(s[2]))
            avg_period = s[3]
            funding_amount = Decimal(str(s[6]))
            funding_used = Decimal(str(s[7]))
            frr_apy = frr * 365 * 100
            print(f"  ✓ 用 /v2/funding/stats hist")
            print(f"  FRR:                {frr*100:.4f}%/day  (~{frr_apy:.2f}% APY)")
            print(f"  平均借出期間:        {avg_period:.2f} days")
            print(f"  Funding 總量:        {funding_amount:>15,.0f} USDT")
            print(f"  已借出量:            {funding_used:>15,.0f} USDT")
            if funding_amount > 0:
                util = funding_used / funding_amount * 100
                print(f"  Utilization:         {util:.2f}%")
            return
    except Exception as e:
        print(f"  ⚠ funding stats fallback 失敗: {e}")

    print("  ✗ 兩個 fallback 都失敗,Bitfinex public API 有問題")


def main() -> None:
    print("=" * 78)
    print("Quiver Earn PoC #2 — Bitfinex Funding API authenticated read")
    print("=" * 78)
    try:
        get_credentials()
    except Exception as e:
        print(f"\n✗ {e}")
        return

    probe_user_info()
    probe_wallets()
    probe_funding_offers()
    probe_funding_credits()
    probe_market_frr()

    print("\n" + "=" * 78)
    print("結論")
    print("=" * 78)
    print("如果上面四個 probe 都成功:")
    print("  ✓ HMAC-SHA384 簽章可以走通")
    print("  ✓ API key 權限足夠 V0.5 read 操作")
    print("  ✓ 可以讀部位、可以讀 FRR")
    print("\n下一步(production):")
    print("  - 加 'Margin Funding — Offer/cancel/close' 寫權限")
    print("  - 加 'Wallets — Transfer' 權限(Exchange↔Funding wallet)")
    print("  - 設 IP whitelist")
    print("  - 不要開 'Withdrawals' 權限,提領走人工 + 2FA")


if __name__ == "__main__":
    main()
