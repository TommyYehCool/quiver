# Quiver Earn — Path A Runbook(operator triage)

> 日常 ops 看這份 — user 抱怨「錢沒 lent 出去」「dashboard 數字怪怪的」「Bitfinex 看不到」之類的怎麼判斷 + 修。

---

## 0. 快速健康檢查指令

```bash
# Worker logs(看最近的 auto_lend / earn_reconcile 事件)
ssh quiver-prod 'docker logs --since=10m quiver-worker-1 2>&1 | grep -iE "auto_lend|earn_reconcile" | tail -30'

# 所有 active earn_account
ssh quiver-prod 'docker exec quiver-postgres-1 psql -U quiver -d quiver -c "
  select id, user_id, auto_lend_enabled, bitfinex_funding_address from earn_accounts where archived_at is null;"'

# 所有非 terminal 的 earn_position(in-flight pipeline)
ssh quiver-prod 'docker exec quiver-postgres-1 psql -U quiver -d quiver -c "
  select id, earn_account_id, status, amount, retry_count, created_at, last_error
  from earn_positions
  where status not in (\"closed_external\", \"failed\")
  order by created_at desc;"'

# 手動觸發 reconcile + auto-renew
ssh quiver-prod 'docker exec quiver-api-1 sh -c "cd /app && PYTHONPATH=/app python -c \"
import asyncio
from arq.connections import RedisSettings, create_pool
from app.core.config import settings
async def main():
    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job(\\\"cron_earn_reconcile\\\")
asyncio.run(main())\""'
```

---

## 1. 「我存錢了,Quiver 沒幫我放貸」

### 步驟 1:確認 deposit POSTED

```sql
select id, status, amount, posted_at from onchain_txs where to_address = '<user.tron_address>' order by id desc limit 5;
```

- POSTED → 進步驟 2
- PROVISIONAL → 等 confirm worker(每 ~1 分鐘),> 5 分鐘還沒 POSTED 看 worker logs

### 步驟 2:確認 sweep 把 USDT 移到 HOT

```bash
docker logs --since=10m quiver-worker-1 2>&1 | grep "sweep_user.*user_id=<X>" | tail -3
```

- `swept:200:0xabc...` → 進步驟 3
- `skipped:below_threshold` → 鏈上 < 10 USDT 不掃
- `skipped:balance_fetch_failed:...` → Tatum 問題;通常 5 分鐘內自癒(看 [memory:Tatum uninit account 403])

### 步驟 3:確認 auto_lend_dispatcher 觸發

```bash
docker logs --since=10m quiver-worker-1 2>&1 | grep "auto_lend_dispatcher.*user_id=<X>" | tail -3
```

可能結果:
- `broadcast:200:0xtxhash` → 已送 Bitfinex,進步驟 4
- `skipped:disabled` → user 把 auto-lend toggle 關了
- `skipped:no_deposit_address` → user 沒貼 Bitfinex Funding 地址(去 admin/earn/[id] 確認 `bitfinex_funding_address`)
- `skipped:no_active_account` → user 沒過 KYC / 沒 connect / earn_account 被 archive
- `skipped:in_flight` → 已有 pipeline 在跑,等
- `skipped:below_min(50)` → 累積不到 150 USDT,等

### 步驟 4:確認 finalizer poll Bitfinex 成功

```bash
docker logs --since=15m quiver-worker-1 2>&1 | grep "auto_lend_finalizer\|auto_lend_offer_submitted" | tail -10
```

- `lent:<offer_id>` → done,Bitfinex 上有 offer
- `retry:<n>:not_credited(...)` → broadcast 上鏈了,Bitfinex 還沒 credit。每 5 分鐘自動 retry,最多 12 次(60 分鐘 window)
- `failed:timeout:...` → Bitfinex 60 分鐘還沒 credit,hand off to manual

---

## 2. 「Bitfinex 已看到 funds idle 但沒掛 offer」

→ 等 `cron_earn_reconcile` 跑(每 30 分鐘一次,minute 5 / 35)。或手動觸發:

```bash
# 見 §0 的「手動觸發 reconcile」指令
```

常見 reconcile 失敗:
- `submit_offer_failed: ... not enough UST balance available`:Bitfinex 對剛 cancel 的 offer 有 1-2 min settling 延遲,等下一輪 cron 自動好
- `submit_offer_failed: ... symbol: invalid`:adapter 用了 fUSDT 而不是 fUST,屬 code bug(我們已 fix,只是備註)
- `bitfinex_query:...`:Bitfinex API 掛了 / IP allowlist 問題 / key 被 revoke

---

## 3. 「user 說 dashboard 顯示跟 Bitfinex 對不上」

最可能:**snapshot 沒 sync**。`earn_position_snapshots` 是每日 cron,即時看 Bitfinex 才準。

手動 sync 該 user:

```bash
# Find earn_account_id from email
# Then call POST /api/admin/earn/accounts/<id>/sync via admin UI
# Or直接 SSH:
ssh quiver-prod 'docker exec quiver-api-1 sh -c "cd /app && PYTHONPATH=/app python -c \"
import asyncio
from datetime import date
from app.core.db import AsyncSessionLocal
from app.services.earn.sync import sync_one_account
async def main():
    async with AsyncSessionLocal() as db:
        r = await sync_one_account(db, earn_account_id=<ID>, snapshot_date=date.today())
        print(r)
asyncio.run(main())\""'
```

如果 sync 之後依然不對:看 admin/earn/[id] 的 Pipeline panel 跟 Bitfinex web UI 對 offer_id。

---

## 4. 「user 想終止 / 取消 auto-lend」

User 自己在 `/earn` 頁關 toggle,**不影響已 lent 部位**(2 天到期自然回 funding)。

完全提錢出 Bitfinex 是 user 自己在 Bitfinex web 操作(取消 active offer + withdraw),Quiver 沒有 withdrawal 權限。

如果 user 要刪 earn_account / revoke Bitfinex 連線:admin 在 admin/earn/[id] 操作 (revoke + archive)。

---

## 5. 緊急 stop:全平台暫停 auto-lend

不太會用到,但萬一發現我們 broadcast 有 bug 要立刻停:

```sql
-- 把所有 user 的 auto_lend_enabled 關掉
update earn_accounts set auto_lend_enabled = false where archived_at is null;
```

(已掛在 Bitfinex 的 offer 不受影響,2 天到期自然 close。)

---

## 6. 監控建議(F-3e 後續可加)

- Cron 卡住 alert(已有 heartbeat watchdog,extend 到 earn_reconcile)
- earn_position 卡 status > 1hr 的 Slack alert(目前只 log warning)
- 每日 digest:total funds at Bitfinex / Quiver / users / 對不上差額
