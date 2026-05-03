# Quiver Earn — Friends Onboarding

> **Status (2026-05-03)**: 此文件原本寫的是 F-Phase 1 read-only 儀表板模式,
> 已被 **F-Phase 3 Path A 自助 auto-lend** 取代。
>
> **新流程請看**:[`earn-bitfinex-api-key-setup.md`](earn-bitfinex-api-key-setup.md)
> (給朋友看的 step-by-step 教學),以及網頁端 `/earn/setup-guide`。

---

## 簡短說明(自助流程)

朋友自己走完整 5 步就能開始:

1. **註冊 Quiver** — Google 登入 (`/login`)
2. **完成 KYC** — `/kyc` 上傳證件 + 自拍,等 admin 審核
3. **連 Bitfinex** — `/earn/connect`,貼 API key + secret + Funding 入金地址
   - 完整教學:`/earn/setup-guide`(or [`docs/earn-bitfinex-api-key-setup.md`](earn-bitfinex-api-key-setup.md))
4. **存 USDT 進 Quiver** — `/wallet` 看入金地址,從外部錢包送 USDT-TRC20
5. **看 Earn 頁** — `/earn` 即時看 funding/lent/收益

之後 Quiver 自動把每筆新 deposit 送進你 Bitfinex Funding wallet 並掛 funding offer 賺利息(2 天期 + auto-renew)。

## 取錢

完全在你掌控:
1. 在 Bitfinex 取消 active funding offer(或等到期)
2. funds idle 進 Funding wallet
3. 在 Bitfinex 提到任何錢包(Quiver 沒有提現權限)

## Reference

- 完整 product plan: [`EARN-PATH-A-MVP-PLAN.md`](EARN-PATH-A-MVP-PLAN.md)
- 操作 runbook:[`EARN-PATH-A-RUNBOOK.md`](EARN-PATH-A-RUNBOOK.md)
- Bitfinex 風險分析:[`EARN-V05-BITFINEX-AAVE-PLAN.md`](EARN-V05-BITFINEX-AAVE-PLAN.md)
