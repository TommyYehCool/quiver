"use client";

/**
 * RedeemButton — F-5a-3.11.7 USD-pivot redemption trigger.
 *
 * Surfaced under the Auto-lend toggle in /earn/bot-settings ONLY when
 * the toggle is OFF (per Tommy's design: "當用戶關掉 Auto-lend, 新增
 * 個贖回按鈕"). Showing it while auto-lend is ON would be confusing —
 * we'd cancel offers that auto-lend would just re-post on the next cron.
 *
 * Click flow:
 *   1. Confirm dialog (this is irreversible — once converted, USD→USDT
 *      isn't free to undo)
 *   2. POST /api/earn/redeem
 *   3. Show result modal: "$X redeemed, $Y locked, withdraw to {addr}"
 *   4. Refresh page so dashboard reflects new state
 *
 * Per Q1 = (c): money locked in active credits stays locked. UI surfaces
 * the locked amount + next-credit-maturity timestamp so user knows when
 * to come back and click again.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ArrowDownToLine, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";

type Locale = "zh-TW" | "en" | "ja";

interface RedeemOut {
  usd_redeemed: string;
  usdt_received: string;
  avg_conversion_rate: string;
  cancelled_offer_count: number;
  locked_in_credits_usd: string;
  next_credit_expires_at: number | null;
  bitfinex_withdraw_destination_hint: string;
}

interface RedeemStrings {
  buttonLabel: string;
  buttonProcessing: string;
  confirmTitle: string;
  confirmBody: string;
  resultTitle: string;
  resultRedeemedLine: (usd: string, usdt: string) => string;
  resultLockedLine: (usd: string, dateStr: string) => string;
  resultNoLocked: string;
  resultCancelledLine: (n: number) => string;
  resultBridgeTitle: string;
  resultBridgeBody: (addr: string) => string;
  resultClose: string;
  errorPrefix: string;
  noFundsTitle: string;
  noFundsBody: string;
}

const STRINGS: Record<Locale, RedeemStrings> = {
  "zh-TW": {
    buttonLabel: "贖回 USD → USDT",
    buttonProcessing: "處理中...",
    confirmTitle: "確認贖回?",
    confirmBody:
      "將取消所有未成交的 USD offer + 把可動用的 USD 換回 USDT。已借出且鎖在 active credit 裡的部分必須等到期才能贖回(會自動列出)。USDT 會落在你的 Bitfinex Funding wallet,需要你手動從 Bitfinex 提領回 Quiver。",
    resultTitle: "贖回完成",
    resultRedeemedLine: (usd, usdt) =>
      `已贖回 $${usd} USD → $${usdt} USDT(已落在 Bitfinex Funding wallet)`,
    resultLockedLine: (usd, dateStr) =>
      `仍有 $${usd} USD 鎖在 active credits,最近一筆於 ${dateStr} 到期 — 屆時請再點一次贖回`,
    resultNoLocked: "沒有鎖定中的部分,本次贖回完整。",
    resultCancelledLine: (n) => `取消了 ${n} 個未成交 offer`,
    resultBridgeTitle: "下一步:從 Bitfinex 提領回 Quiver",
    resultBridgeBody: (addr) =>
      `登入 Bitfinex → Funding wallet → 提現 USDT(TRC20)→ 提領地址貼上你的 Quiver 收款地址:\n\n${addr}\n\n(F-5a-3.11 MVP 此步驟為手動;之後會自動化整合)`,
    resultClose: "知道了",
    errorPrefix: "贖回失敗:",
    noFundsTitle: "目前沒有可贖回的 USD",
    noFundsBody:
      "你目前沒有未成交 USD offer,Bitfinex Funding USD 餘額也是 0。如果有錢鎖在 active credits,請等到期後再點贖回。",
  },
  en: {
    buttonLabel: "Redeem USD → USDT",
    buttonProcessing: "Processing...",
    confirmTitle: "Confirm redeem?",
    confirmBody:
      "Cancels all unmatched USD offers + converts available USD back to USDT. Funds locked in active credits must wait for maturity (shown afterwards). USDT lands in your Bitfinex Funding wallet — you'll need to manually withdraw from Bitfinex back to Quiver.",
    resultTitle: "Redeemed",
    resultRedeemedLine: (usd, usdt) =>
      `Redeemed $${usd} USD → $${usdt} USDT (now in Bitfinex Funding wallet)`,
    resultLockedLine: (usd, dateStr) =>
      `$${usd} USD still locked in active credits; nearest maturity ${dateStr}. Click Redeem again then.`,
    resultNoLocked: "No locked portion — this redeem is complete.",
    resultCancelledLine: (n) => `Cancelled ${n} unmatched offer(s)`,
    resultBridgeTitle: "Next: withdraw from Bitfinex to Quiver",
    resultBridgeBody: (addr) =>
      `Sign in to Bitfinex → Funding wallet → Withdraw USDT (TRC20) → paste your Quiver receive address:\n\n${addr}\n\n(F-5a-3.11 MVP keeps this manual; auto-bridge in a later iteration)`,
    resultClose: "Got it",
    errorPrefix: "Redeem failed: ",
    noFundsTitle: "Nothing to redeem",
    noFundsBody:
      "No unmatched USD offers and 0 USD balance on Bitfinex Funding. If funds are locked in active credits, wait for maturity then click Redeem again.",
  },
  ja: {
    buttonLabel: "USD → USDT 償還",
    buttonProcessing: "処理中...",
    confirmTitle: "償還を確認?",
    confirmBody:
      "未約定の USD offer をすべてキャンセルし、利用可能な USD を USDT に変換します。active credit にロックされている分は満期まで待つ必要があります。USDT は Bitfinex Funding ウォレットに着金 — 手動で Quiver へ出金してください。",
    resultTitle: "償還完了",
    resultRedeemedLine: (usd, usdt) =>
      `$${usd} USD → $${usdt} USDT を償還(Bitfinex Funding ウォレットに着金)`,
    resultLockedLine: (usd, dateStr) =>
      `$${usd} USD がまだ active credits にロック中。最も早い満期: ${dateStr} — その時に再度償還を押してください`,
    resultNoLocked: "ロック分なし — 今回の償還は完了。",
    resultCancelledLine: (n) => `${n} 件の未約定 offer をキャンセル`,
    resultBridgeTitle: "次:Bitfinex から Quiver へ出金",
    resultBridgeBody: (addr) =>
      `Bitfinex にログイン → Funding ウォレット → USDT(TRC20)を出金 → 出金先に Quiver 受取アドレスを貼り付け:\n\n${addr}\n\n(F-5a-3.11 MVP では手動;後の iteration で自動化)`,
    resultClose: "了解",
    errorPrefix: "償還失敗: ",
    noFundsTitle: "償還可能な USD なし",
    noFundsBody:
      "未約定 USD offer なし、Bitfinex Funding USD 残高も 0。active credit にロックされている資金は満期後に再度償還を押してください。",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtMaturityDate(ms: number, locale: Locale): string {
  const d = new Date(ms);
  return d.toLocaleString(locale === "zh-TW" ? "zh-TW" : locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RedeemButton() {
  const router = useRouter();
  const locale = pickLocale(useLocale());
  const s = STRINGS[locale];
  const confirm = useConfirm();

  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<RedeemOut | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleClick() {
    const ok = await confirm({
      title: s.confirmTitle,
      body: s.confirmBody,
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<RedeemOut>("/api/earn/redeem", { method: "POST" });
      setResult(r);
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "unknown error";
      setErr(`${s.errorPrefix}${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={busy}
        className="w-full sm:w-auto"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {s.buttonProcessing}
          </>
        ) : (
          <>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            {s.buttonLabel}
          </>
        )}
      </Button>

      {err && (
        <div className="mt-2 rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
          {err}
        </div>
      )}

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResult(null);
          }}
        >
          <div className="w-full max-w-lg rounded-lg border border-cream-edge bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {Number(result.usd_redeemed) === 0 && result.cancelled_offer_count === 0 ? (
              <>
                <h2 className="mb-3 text-lg font-semibold">{s.noFundsTitle}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {s.noFundsBody}
                </p>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-lg font-semibold">{s.resultTitle}</h2>
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {Number(result.usd_redeemed) > 0 && (
                    <li>
                      ✓{" "}
                      {s.resultRedeemedLine(
                        fmtUsd(result.usd_redeemed),
                        fmtUsd(result.usdt_received),
                      )}
                    </li>
                  )}
                  {result.cancelled_offer_count > 0 && (
                    <li>✓ {s.resultCancelledLine(result.cancelled_offer_count)}</li>
                  )}
                  {Number(result.locked_in_credits_usd) > 0 ? (
                    <li className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      ⏳{" "}
                      {s.resultLockedLine(
                        fmtUsd(result.locked_in_credits_usd),
                        result.next_credit_expires_at
                          ? fmtMaturityDate(result.next_credit_expires_at, locale)
                          : "—",
                      )}
                    </li>
                  ) : Number(result.usd_redeemed) > 0 ? (
                    <li className="text-emerald-700 dark:text-emerald-400">
                      ✓ {s.resultNoLocked}
                    </li>
                  ) : null}
                </ul>

                {Number(result.usdt_received) > 0 && (
                  <div className="mt-4 rounded-md bg-sky-50 p-3 text-sm dark:bg-sky-950/30">
                    <p className="mb-2 font-medium text-sky-800 dark:text-sky-300">
                      {s.resultBridgeTitle}
                    </p>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs text-sky-900 dark:text-sky-200">
                      {s.resultBridgeBody(result.bitfinex_withdraw_destination_hint)}
                    </pre>
                  </div>
                )}
              </>
            )}

            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setResult(null)}>
                {s.resultClose}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
