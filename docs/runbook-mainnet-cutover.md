# Runbook — Mainnet Cutover

> 從 Shasta testnet 切到 Tron mainnet。**不可逆**:dev seed ≠ prod seed,切過去後 testnet 帳戶不會跟著過去。

## 設計原則

- **Production 與 dev 完全隔離**:不同 master seed、不同 KEK、不同 DB、不同 server
- 用戶從零開始(沒有 testnet → mainnet migration)
- testnet 環境保留作為測試用

## 切換清單

### 1. `.env.production` 確認

| key | testnet 值 | mainnet 值 |
|---|---|---|
| `ENV` | `testnet` | `mainnet` |
| `TATUM_API_KEY_MAINNET` | (空) | 從 dashboard.tatum.io 拿(**付費 plan**) |
| `WEBHOOK_CALLBACK_URL` | ngrok URL | `https://api.quiver.io` (固定) |

`USDT_CONTRACT` 的選擇是程式碼自動依 `ENV` 切:
- testnet → `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs`(Shasta USDT)
- mainnet → `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`(Tether 真本尊)

### 2. Tatum subscription 規模

free plan 上限 5 個 subscription。預期上線後馬上會超過 — 升級到 **Standard plan(月付制)**,上限 1000 個 subscription。

### 3. 提領手續費校準

mainnet TRC-20 transfer gas 約 ~14 USDT 等值的 TRX(浮動)。建議:

```
WITHDRAWAL_FEE_USDT=2  # 平台收 2,FEE_PAYER 實際付 ~14 TRX
```

> 平台可從手續費收益 + sweep 自然累積補 FEE_PAYER 的 TRX 消耗。
> Phase 6E-4(冷熱錢包)會加自動回流 / 提醒機制。

### 4. FEE_PAYER 補錢

mainnet FEE_PAYER 至少要 ≥ 500 TRX(可走幾百筆提領)。從 admin 個人錢包送過去。

低於 100 TRX 會自動阻擋新提領(phase 5C 的 `FEE_PAYER_MIN_TRX_FOR_WITHDRAWAL` 守則)。

### 5. HOT wallet 啟用

第一筆 user 入金後 cron sweep 會自動把 USDT 集中到 HOT。
**首次 HOT 收到 USDT 之前要先收一筆 TRX 啟用帳戶**(Tron 帳戶啟用機制)。
建議從 admin 錢包送 1 TRX 到 HOT 地址。

### 6. webhook URL 換

去 Tatum dashboard 確認所有 subscription 的 callback URL 是 `https://api.quiver.io/api/webhooks/tatum/<token>`。
如果之前 dev 用 ngrok URL,**ngrok 一定要關掉,避免測試流量打到 production**。

### 7. Real money sanity test

- 先用 admin 自己的錢包入 5 USDT 到 admin 在 quiver 的地址
- 等 1 分鐘 → 確認 dashboard 顯示「處理中」 → 約 60 秒 → 顯示「已到帳」
- 試提 4 USDT(扣 2 fee)到 admin 自己錢包
- 等 90 秒 → COMPLETED + 鏈上看得到 tx
- 對 audit log 檢查整個流程都有寫入

只有這 5 USDT 全程 OK,才開放給其他用戶。

### 8. 監控 24 小時

cutover 後 24 小時內重點看:
- Sentry 有沒有跳 unhandled
- cron heartbeat 是否準時
- FEE_PAYER 餘額消耗速率
- HOT 餘額是否如預期增長(sweep 工作正常)
- reconciliation cron(每天 03:00)是否 OK

任一異常 → 啟動 incident response。

## Rollback

mainnet 切完不能 rollback(用戶資金已經實際存在於 mainnet)。任何問題都應該:
1. 立刻把 api / web 改成「維護中」頁(暫停新交易,但 webhook 還在收)
2. 排查 + 修補
3. 復原服務

維護中頁可以塞個簡單 nginx 規則 → 5xx 之外一律回固定 HTML。
