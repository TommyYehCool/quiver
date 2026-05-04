/**
 * F-5b-5 — Onboarding "deposit a fee buffer" banner on /earn.
 *
 * Quiver collects perf fees from the user's Quiver wallet balance (since
 * Quiver has no Bitfinex withdrawal permission). New users who connect
 * Bitfinex but never deposit USDT into Quiver wallet will silently rack
 * up unpaid accruals and eventually get auto-paused at week 4 of dunning.
 *
 * This banner is the proactive nudge — sits at the top of /earn whenever:
 *   - user has an earn_account (in the funnel)
 *   - user pays perf fee (not Friend tier, not Premium)
 *   - Quiver wallet balance < BUFFER_THRESHOLD_USDT
 *
 * Auto-disappears once the balance is healthy.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

const BUFFER_THRESHOLD_USDT = 30;

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<
  Locale,
  {
    title: string;
    body: (balance: string) => string;
    cta: string;
    premiumAlt: string;
  }
> = {
  "zh-TW": {
    title: "Quiver 錢包餘額太少,績效費可能扣不到",
    body: (balance) =>
      `你目前 Quiver 錢包只有 $${balance}。Quiver 收績效費的方式是從你 Quiver 錢包扣 — 餘額不夠的話,連續 4 週收不到會自動暫停你的自動放貸。建議先儲值 $50 以上當預留金。`,
    cta: "去儲值錢包",
    premiumAlt: "想完全跳過這煩惱?升級 Premium 月訂閱(永久 0% 績效費)",
  },
  en: {
    title: "Quiver wallet balance is low — performance fees may go unpaid",
    body: (balance) =>
      `Your Quiver wallet has only $${balance}. Quiver deducts performance fees from this balance — if it stays empty for 4 consecutive weeks your auto-lend will be auto-paused. Top up at least $50 as a buffer.`,
    cta: "Top up wallet",
    premiumAlt: "Want to skip this entirely? Upgrade to Premium (0% perf fee while subscribed)",
  },
  ja: {
    title: "Quiver ウォレット残高が少ない — フィーが回収できない可能性",
    body: (balance) =>
      `現在 Quiver ウォレット残高は $${balance}。Quiver はパフォーマンスフィーをこの残高から差し引きます。残高不足が 4 週続くと auto-lend が自動停止されます。$50 以上をバッファとしてチャージしてください。`,
    cta: "ウォレットをチャージ",
    premiumAlt: "煩わしさを完全に回避?Premium にアップグレード(購読中 0%)",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  locale: string;
  /** Quiver wallet balance in USDT (string from API). */
  walletBalance: string;
  /** True for Friend tier OR Premium subscriber. */
  isExempt: boolean;
}

export function BufferEmptyBanner({ locale, walletBalance, isExempt }: Props) {
  if (isExempt) return null;
  const balance = Number(walletBalance);
  if (Number.isNaN(balance) || balance >= BUFFER_THRESHOLD_USDT) return null;

  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 flex-none text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {s.title}
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {s.body(fmtUsd(walletBalance))}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={`/${locale}/wallet`}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              {s.cta} <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href={`/${locale}/subscription`}
              className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
            >
              {s.premiumAlt}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
