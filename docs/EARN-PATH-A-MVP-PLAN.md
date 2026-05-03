# Quiver Earn — Path A MVP Plan(self-service Bitfinex 自動放貸)

> **Status**: Plan locked,2026-05-03 對齊完成,準備進 F-3a 開發
> **Companion**: 取代 `EARN-FRIENDS-TOOLING-PLAN.md` 的 read-only 設計;沿用 `EARN-V05-BITFINEX-AAVE-PLAN.md` 的 Bitfinex 風險分析跟 APY 估算
> **Closed alpha 範圍**: tommy + 2-3 朋友;律師諮詢推遲到 alpha 驗證後再做

---

## TL;DR

User 用 Google 註冊 → KYC → 自助提供 Bitfinex API key(讀+ funding 寫,**不含 Create withdrawal**)→ 把 USDT 存進 Quiver → Quiver 自動把 USDT 廣播到 user 自己的 Bitfinex Funding wallet 並掛 funding offer。**錢始終在 user 自己 KYC 過的 Bitfinex 帳號**,出金 user 自己在 Bitfinex 操作。

預估工程量:**8-10 天 dev + 2-3 天 QA = 約 2 週 ship**。

---

## 1. User Journey

```
1. Google 註冊         ✅ existing (/login)
2. KYC 驗證            ✅ existing (form 已 mobile-fixed)
3. 提供 Bitfinex key  ❌ NEW: /earn/connect + /earn/setup-guide
4. Deposit USDT       ✅ existing (deposit → tron_address → sweep → HOT)
5. Quiver 自動放貸    ❌ NEW: auto-lend pipeline (F-3a~e)
```

KYC gate(decision: option B):`/earn` 看得到 + 「Connect Bitfinex」按鈕在 KYC 沒過時 disabled + 提示去做 KYC。

---

## 2. Architecture Decisions(本 plan locked)

| # | Decision | Why |
|---|---|---|
| 1 | Bitfinex deposit address 用 **API auto-fetch**,不要 user 手動 paste | 避免 paste 錯字;一個 API call 就解決 |
| 2 | **直接送 user 的 Funding wallet TRC20 地址** | Bitfinex 三個 wallet 各有獨立永久地址,跳過 Exchange→Funding 內部轉帳 |
| 3 | Auto-lend toggle:**default on,user 可關**(option B) | user 控制感 + 預設行為符合產品 promise |
| 4 | **不要 `Create withdrawal` 權限** | 出金保持 user 在 Bitfinex UI 自己做,風險可控;最大威脅就是這個 perm |
| 5 | **不要 `Transfer between wallets` 權限** | #2 直接送 Funding 地址,不需要 |
| 6 | Min funding offer: **150 USDT**(Bitfinex 規則) | < 150 暫存,等累積夠才掛 |
| 7 | Default offer **2 天期 + Bitfinex 原生 FRR auto-renew** | 流動性最高,renew 不用我們寫 cron |
| 8 | 不設 minimum rate floor | MVP 簡單;後續看數據再加 |
| 9 | 教學頁 = **單頁長文 + screenshots**(option a) | MVP 簡單;以後升級 wizard |
| 10 | 律師諮詢 timing | **alpha 完成、開放 > 5 用戶前** 諮詢 |

---

## 3. Engineering Breakdown(F-Phase 3)

### F-3a: Bitfinex write adapter + schema(2 天)

- [ ] `services/earn/bitfinex_adapter.py` 加方法:
  - `get_funding_deposit_address(method='tetherusx')` — auto-fetch user TRC20 入金地址
  - `submit_funding_offer(currency, amount, rate, period, auto_renew=True)`
  - `cancel_funding_offer(offer_id)`
  - `list_active_offers(currency)`
- [ ] 單測 mock httpx + 完整 HMAC 簽章驗證
- [ ] Migration:`earn_accounts` 加 `bitfinex_funding_address` (cached) + `auto_lend_enabled` bool
- [ ] Migration:新建 `earn_positions` 表 (`status`, `amount`, `tx_hash`, `bitfinex_offer_id`, `created_at`)
- [ ] Manual test:tommy SSH script call 各 endpoint 確認真的通

### F-3b: Auto-lend worker pipeline(2 天)

- [ ] `EarnPositionStatus` enum:`pending_outbound | onchain_in_flight | funding_idle | lent | closing | closed_external`
- [ ] Worker `auto_lend_dispatcher(user_id)`:
  - 觸發點:[`worker.py:187`](apps/api/app/worker.py:187) sweep_user 完成後 enqueue
  - 條件檢查:earn_account active + auto_lend_enabled + ledger 累積 ≥ 150
  - Broadcast HOT → user.bitfinex_funding_address(複用 sweep 的 broadcast helper + FEE_PAYER 補 gas)
  - 建 `earn_position` status=`onchain_in_flight`
  - Enqueue `auto_lend_finalizer` defer 5 min
- [ ] Worker `auto_lend_finalizer(position_id)`:
  - Poll Bitfinex funding wallet,確認餘額已 increment
  - 找到 → status=`funding_idle` → call submit_funding_offer → status=`lent` + 記 offer_id
  - 沒找到(timing 問題)→ retry with exponential backoff,最多 1 hr 後 alert
- [ ] **Manual e2e**:tommy 從 user dashboard deposit 200 USDT → 5-10 分鐘內 Bitfinex Funding 收到 → 看 offer 掛上去

### F-3c': User UI(self-service 完整版)(2 天)

```
/earn (主頁,user 看自己部位)
  ├── 大數字:total earning / current APY estimate
  ├── 部位拆解:funding_idle / lent / accrued_interest
  ├── 30d / 7d / today snapshot 折線圖
  ├── Toggle: "Auto-lend my deposits"(預設 on)
  └── If 沒 connect Bitfinex → CTA "Connect your Bitfinex"
       If KYC 沒過 → CTA disabled + "Complete KYC first"

/earn/connect (連 Bitfinex)
  ├── Inline mini-checklist(必開的 / 絕對不能開的權限)
  ├── 表單:API key + secret(password input)
  ├── "Test connection" button → 即時 call Bitfinex 驗證 + auto-fetch funding address
  ├── 成功:redirect /earn,顯示 success toast
  └── 連結 → /earn/setup-guide(完整教學)

/earn/setup-guide (純文字 + 截圖教學)
  ├── Step-by-step Bitfinex 開 API key
  ├── 權限清單 ✅ / ❌
  ├── IP allowlist:顯示 prod IP 45.77.30.174
  └── FAQ:「弄錯怎麼辦」「key 被偷怎辦」「我可以隨時撤回嗎」
```

- [ ] KYC gate 邏輯(option b)
- [ ] 表單防呆:secret 輸入後 mask 顯示,防止意外暴露

### F-3d: Admin pipeline status panel + 文件(0.5 天)

- [ ] Admin earn detail page 加「Pipeline status」card:列出該 user 所有 earn_positions + 每個 status + tx hashes
- [ ] 改寫 `docs/earn-friends-onboarding.md`:從 read-only 改為 self-service auto-lend
- [ ] 新增 `docs/EARN-PATH-A-RUNBOOK.md`:operator triage 手冊

### F-3e: Reconciliation cron + alerts(1-2 天)

- [ ] Cron `earn_reconcile`(每 30 min):
  - 對每個 active earn_account call Bitfinex sync
  - 鏈上對帳:HOT → user_bitfinex 的 broadcast tx 是否真的上鏈、是否被 Bitfinex credit
  - Bitfinex 上的 active offers 對 earn_position 的 mapping 一致性
  - Diff 寫 audit log + Slack(若有設)alert
- [ ] Pipeline 卡 > 1 hour 的 earn_position alert
- [ ] Admin overview 加「Earn 健康度」card

---

## 4. 資金流程 timeline

```
T=0     user deposit 200 USDT → user.tron_address              [existing]
T=1m    sweep_user → HOT (200 USDT)                            [existing]
T=2m  ★ auto_lend_dispatcher 觸發
        條件 ✓:auto_lend_enabled + ledger ≥ 150
        Broadcast: HOT → user.bitfinex_funding_address (200)
        FEE_PAYER 付 gas
        建 earn_position(amount=200, status=onchain_in_flight)
        Enqueue auto_lend_finalizer defer 5min
T=3m    Tron block confirmed
T=7m  ★ auto_lend_finalizer 跑
        Poll Bitfinex /v2/auth/r/wallets → 看到 funding wallet +200
        status = funding_idle
        Submit funding offer (FRR, 2-day, auto-renew)
        Bitfinex 回 offer_id
        status = lent
T+2d    Bitfinex 自動 renew → 新 offer_id
        sync 自動 detect、update earn_position.bitfinex_offer_id
T+Nd    user 想取錢 → 在 Bitfinex 自己 cancel + withdraw 到外部
        sync 看到 funding=0 + 沒 active offer
        status = closed_external
```

---

## 5. Ledger model

**原則**:Ledger 只記「USDT 進 / 出 Quiver custody」這個粗粒度事件;Bitfinex 內部 funding/lent/interest 細節**全部用 `earn_position_snapshots` 表達**(已存在 schema),不 double-book。

新增 entry types:
- `EARN_OUTBOUND`(USDT 從 HOT 送到 user.bitfinex_funding,visible balance 從 user 角度沒變,但 PLATFORM_CUSTODY 減少)
- `EARN_INBOUND`(若未來實作贖回 path)

---

## 6. Bitfinex API 權限總清單

✅ **Required**:
- Account Info → Get account fee information
- Account History → Get historical balances entries
- Orders → Get orders and statuses
- Margin Trading → Get position and margin info
- Margin Funding → Get funding statuses and info
- **Margin Funding → Offer, cancel and close funding** ⭐ NEW(F-3 才需)
- Wallets → Get wallet balances and addresses
- Wallets → Get deposit addresses
- Settings → Read account settings

❌ **Forbidden**(setup-guide 紅字標明):
- **Create a new withdrawal** ← 最大威脅,絕對不開
- Edit account information
- Create and cancel orders
- Transfer between your wallets
- Claim a position

---

## 7. Risk & Mitigation

| 風險 | Mitigation |
|---|---|
| User Bitfinex deposit address 拿錯 / cache 過期 | API auto-fetch + 每次 broadcast 前 refresh;onboarding 強制 1 USDT 測試 |
| Bitfinex API down 中途 | retry + exponential backoff;state machine idempotent;> 1hr 卡 alert |
| User Bitfinex 被風控凍結 | sync 失敗 → admin alert,該 user auto-lend 暫停 |
| HOT 餘額不夠執行 auto-lend(sweep 落後) | dispatcher 看 ledger 不看鏈上,ledger 餘額足才 broadcast |
| 法律疑慮(代操定性) | Closed alpha < 5 用戶 OK;>5 前找律師(本 plan locked decision) |
| Min offer 150 限制下小額 deposit 卡住 | UI 顯示「累積中:120/150」,user 知道為何沒掛 |
| 用戶 toggle off 後已 lent 部位怎處理 | toggle off 只阻止**新** deposit auto-lend;既有 lent 自然到期回 funding_idle 後不再 renew |

---

## 8. Out of Scope(本 MVP 不做)

- Auto-withdraw / 贖回到 Quiver(用 `Create withdrawal` 權限,風險不對等;user 自己在 Bitfinex 提)
- AAVE V3 Polygon 部分(留 V0.5)
- Performance fee(本 alpha 完全免費)
- Web push / email 通知(完成 sync 後 toast 即可)
- 多協議 aggregator(留 V2)

---

## 9. Closed Alpha 驗證 checklist(F-3 完成後)

- [ ] Tommy 自己跑完整 flow:Google → KYC → connect Bitfinex → deposit 100 USDT → 看到 lent 上去
- [ ] 至少撐滿 1 個 2-day cycle 看 auto-renew 真的 work
- [ ] 邀請 1 個朋友走完一樣 flow
- [ ] 30 天累積看真實 APY 跟 EARN-V05 plan 估的 ~10% 是否接近
- [ ] 朋友自己手動贖回(在 Bitfinex 取消 offer + withdraw),確認 Quiver sync 正確顯示 closed
- [ ] 邀請 2-3 朋友前**找律師諮詢**

---

## 10. References

- `docs/EARN-V05-BITFINEX-AAVE-PLAN.md` — Bitfinex 風險分析、APY 結構
- `docs/EARN-FRIENDS-TOOLING-PLAN.md` — 原本的 read-only Friends 設計(本 plan 取代)
- `docs/earn-friends-onboarding.md` — onboarding 文件(F-3d 會改寫)
- `apps/api/app/services/earn/bitfinex_adapter.py` — read 路徑已實作,本 plan 加 write
- `apps/api/app/models/earn.py` — schema 已有 `CustodyMode.PLATFORM` / `can_quiver_operate` hooks
