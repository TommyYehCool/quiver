"use client";

import * as React from "react";
import { TrendingUp, Hourglass } from "lucide-react";

import type { ActiveCreditOut } from "@/lib/api/earn-user";

/**
 * 顯示單筆 Bitfinex active funding credit:
 * - amount + 利率 (daily + APR)
 * - 預期利息(到期時 = amount × rate × days)
 * - 到期倒數(每秒更新一次)
 */
export function ActiveCreditRow({ credit }: { credit: ActiveCreditOut }) {
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
            <span className="text-sm font-normal text-slate-500">USDT</span>
          </p>
          <p className="text-[10px] text-slate-500">offer #{credit.id}</p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          已借出
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat
          label="利率 / 日"
          value={`${rateDailyPct.toFixed(4)}%`}
          icon={<TrendingUp className="h-3 w-3" />}
        />
        <Stat label="年化 (APR)" value={`${apr.toFixed(2)}%`} />
        <Stat
          label="預期利息"
          value={`+${expectedInterest.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
          tone="success"
        />
        <Stat
          label="到期"
          value={expired ? "已到期" : formatRemaining(remainingMs)}
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
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {subtitle ? (
        <p className="text-[10px] text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} 天 ${hours} 小時`;
  if (hours > 0) return `${hours} 小時 ${mins} 分`;
  return `${mins} 分鐘`;
}
