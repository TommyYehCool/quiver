"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { TrendingUp, Hourglass } from "lucide-react";

import type { ActiveCreditOut } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";
const STRINGS: Record<Locale, {
  badge: string;
  ratePerDay: string;
  apr: string;
  expectedInterest: string;
  expires: string;
  expired: string;
  fmtRemaining: (days: number, hours: number, mins: number) => string;
}> = {
  "zh-TW": {
    badge: "已借出",
    ratePerDay: "利率 / 日",
    apr: "年化 (APR)",
    expectedInterest: "預期利息",
    expires: "到期",
    expired: "已到期",
    fmtRemaining: (d, h, m) =>
      d > 0 ? `${d} 天 ${h} 小時` : h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`,
  },
  en: {
    badge: "Lent",
    ratePerDay: "Rate / day",
    apr: "Annualised (APR)",
    expectedInterest: "Expected interest",
    expires: "Expires",
    expired: "Expired",
    fmtRemaining: (d, h, m) =>
      d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`,
  },
  ja: {
    badge: "貸出中",
    ratePerDay: "利率 / 日",
    apr: "年率 (APR)",
    expectedInterest: "予想利息",
    expires: "満期",
    expired: "満期済み",
    fmtRemaining: (d, h, m) =>
      d > 0 ? `${d} 日 ${h} 時間` : h > 0 ? `${h} 時間 ${m} 分` : `${m} 分`,
  },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

/**
 * 顯示單筆 Bitfinex active funding credit:
 * - amount + 利率 (daily + APR)
 * - 預期利息(到期時 = amount × rate × days)
 * - 到期倒數(每秒更新一次)
 */
export function ActiveCreditRow({ credit }: { credit: ActiveCreditOut }) {
  const s = STRINGS[pickLocale(useLocale())];
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000); // 每分鐘更新就夠精細
    return () => clearInterval(t);
  }, []);

  const remainingMs = credit.expires_at_ms - now;
  const expired = remainingMs <= 0;
  const expiresAt = new Date(credit.expires_at_ms);
  const expiresAtStr = expiresAt.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const apr = Number(credit.apr_pct);
  const rateDailyPct = Number(credit.rate_daily) * 100;
  const expectedInterest = Number(credit.expected_interest_at_expiry);
  const amount = Number(credit.amount);

  return (
    <div className="rounded-xl border border-cream-edge bg-paper p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header: amount + offer id */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-semibold tabular-nums">
            {amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="text-sm font-normal text-slate-500">{credit.currency || "USDT"}</span>
          </p>
          <p className="text-xs text-slate-500">offer #{credit.id}</p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {s.badge}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat
          label={s.ratePerDay}
          // 6 decimal places matches Bitfinex's funding panel display
          // exactly (e.g., "0.008010%"). 4 decimals silently truncated
          // the trailing digit, making users wonder if our number was off.
          value={`${rateDailyPct.toFixed(6)}%`}
          icon={<TrendingUp className="h-3 w-3" />}
        />
        <Stat label={s.apr} value={`${apr.toFixed(2)}%`} />
        <Stat
          label={s.expectedInterest}
          value={`+${expectedInterest.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
          tone="success"
        />
        <Stat
          label={s.expires}
          value={expired ? s.expired : formatRemaining(remainingMs, s.fmtRemaining)}
          subtitle={expiresAtStr}
          icon={<Hourglass className="h-3 w-3" />}
          tone={expired ? "warning" : "default"}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  subtitle,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : "text-slate-800 dark:text-slate-200";
  return (
    <div>
      <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {subtitle ? (
        <p className="text-xs text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function formatRemaining(
  ms: number,
  fmt: (d: number, h: number, m: number) => string,
): string {
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  return fmt(days, hours, mins);
}
