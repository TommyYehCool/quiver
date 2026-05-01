# Quiver Earn — 朋友 onboarding 指南

> 給想跟 Tommy 一起測試 Earn 工具的朋友看的 step-by-step。
> 5 分鐘設定,你的 USDT 永遠在你自己 Bitfinex 帳戶,Quiver 只當 read-only 儀表板。

---

## 你會收到什麼價值

- 看到自己 USDT 在 Bitfinex Funding 跟 AAVE V3 的當前部位
- 跨平台 APY 比較,知道現在哪邊較划算
- (Phase 2)月報 email 自動寄給你,看每月實際賺多少
- 完全自由:你決定要不要把 USDT 放進去、何時撤回

---

## 你**不會**遇到的事

- ❌ 你的錢被 Quiver 動到(Quiver 沒有 transfer 跟 withdraw 權限)
- ❌ 收費(Phase 1 完全免費)
- ❌ 把錢給「Quiver 平台」(你的錢一直在 Bitfinex 你帳號裡)
- ❌ KYC(Quiver 不要求,你的 KYC 由 Bitfinex 自己處理)

---

## 步驟一:在 Bitfinex 開 read-only API key(2 分鐘)

1. 登入你的 Bitfinex 帳號
2. 右上角頭像 → **API Keys**(或直接到 https://setting.bitfinex.com/api )
3. 點「Create New API Key」
4. **權限設定**(超重要):

   ✅ **要打開的(全部 read 類)**:
   - Account Info → Get account fee information
   - Account History → Get historical balances entries and trade information
   - Orders → Get orders and statuses
   - Margin Trading → Get position and margin info
   - Margin Funding → **Get funding statuses and info** ⭐
   - Wallets → **Get wallet balances and addresses** ⭐
   - Settings → Read account settings

   ❌ **絕對不要打開**(全部 write 類):
   - Edit account information
   - Create and cancel orders
   - Claim a position
   - Offer, cancel and close funding
   - Transfer between your wallets
   - **Create a new withdrawal**(這個是錢被偷的最大威脅,任何時候都不要開)

5. **Label**:`quiver-poc-readonly`(易記、好辨識,將來 rotate 看就知道是哪個)

6. **IP Whitelist**(極建議):
   - Tommy 會給你一個 IP 地址
   - 加到 Allowed IPs 欄位
   - 這樣即使 API key 被偷,從別的 IP 也用不了

7. **2FA 驗證碼**輸入後,「Generate Key」

8. 系統會給你 API key + secret(secret 只顯示一次)

---

## 步驟二:把 key 安全地給 Tommy

**禁止**用以下方式傳:
- ❌ Email(永久存在,難刪)
- ❌ 公開群組訊息
- ❌ 截圖貼到 Slack / Discord

**推薦**:
- ✅ Signal(end-to-end encrypted,可設定訊息自動 expire)
- ✅ Telegram secret chat
- ✅ 加密過的 1Password share link
- ✅ 當面口頭(笑)

格式:
```
Quiver Earn API key (read-only):
Key:    t-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Polygon address (我的 MetaMask):
0x...

Tron address (可選,用來統計總部位):
T...
```

Tommy 收到後會立刻在 Quiver 加密存(AES-GCM + KEK,跟錢包私鑰同個保護機制),然後從 Signal 把訊息刪掉。

---

## 步驟三:確認 Quiver 看得到你的部位

1. Tommy 加完後會傳你截圖,確認 Quiver dashboard 看到的數字跟你 Bitfinex 帳戶一致
2. 如果有差異,可能是:
   - Bitfinex 還在算結算(等 5 分鐘再 reload)
   - API key 權限沒開全(回去 Bitfinex 補)
   - 部位有在 Margin trading wallet 而不是 Funding wallet(Quiver 只看 Funding wallet)

---

## 隨時想終止?

從 Bitfinex web UI:
1. Settings → API Keys
2. 找到 `quiver-poc-readonly`
3. 點 **Revoke**
4. 立刻失效(Quiver 下次同步會 fail,你跟 Tommy 確認後 admin 會 archive 那個 earn_account)

---

## 安全 FAQ

### Q: 如果 Quiver 主機被駭了,我的錢會怎樣?

**不會被偷**。原因:
- API key 只能 read,**不能 transfer / withdraw**
- 加密儲存(AES-GCM + 32 bytes KEK)
- 駭客最多能看你的部位資訊(隱私損失,但錢沒事)
- IP whitelist 限制,從 Quiver 主機以外的地方 key 也叫不動

### Q: Tommy 會看到我的隱私資料嗎?

只會看到:
- 你的 Bitfinex Funding wallet 餘額
- 你借出去多少
- 你 Polygon AAVE 部位餘額
- 你的部位歷史趨勢

**不會看到**:
- 你的 Bitfinex 登入密碼 / 2FA(API 不需要)
- 你的 Bitfinex 訂單詳情(API key 沒開 trading 那組權限)
- 你其他交易所 / wallet 的資料

### Q: 如果 Bitfinex 被駭呢?

那就是 Bitfinex 的事,跟 Quiver 無關。但歷史紀錄:Bitfinex 從 2016 年那次後重組過,11 年沒再被駭過。風險不為 0 但相對低。建議不要把全部身家放上去,大額存 cold wallet。

### Q: 我可以把 API key 撤銷後又再加嗎?

可以。流程:
1. Bitfinex 撤銷舊 key
2. 開新 key(可以同名 `quiver-poc-readonly-v2`)
3. 把新 key 給 Tommy
4. Tommy 在 Quiver admin 點「revoke」舊 connection,然後加新 connection

---

## 出問題找誰?

直接 Signal / Telegram 找 Tommy。問題類型:
- API key 設定錯誤 → 我可以遠端教你
- Quiver 數字不對 → 我這邊查 log
- Bitfinex 帳號出狀況 → 找 Bitfinex 客服(我幫不了)
- 想加 / 改 / 撤功能 → 跟我聊

---

## 法律 / 免責

- Quiver 是私人工具,**不是合規金融產品**(沒金管會牌照,不需要,因為 Tommy 不持有你的錢、不收費)
- 你自己 Bitfinex 帳戶的資金,風險 / 收益**全部由你承擔**
- Tommy 不對 Bitfinex / AAVE / DeFi 任何 protocol 的事故負責
- 我們是朋友間共享工具,別把這個當成正式投資建議

如果你 OK 這些前提,就回 Tommy 「我同意」,他會把你加進去。

---

_最後更新:2026-05-01_
