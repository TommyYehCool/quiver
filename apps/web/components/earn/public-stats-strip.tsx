/**
 * F-5b-1 — Public stats hero strip on /earn (and anywhere else we want
 * social proof). Renders 3 numbers: active bots / total lent / avg APR.
 *
 * Server component. Data is server-cached at the API layer (60s TTL) and
 * also at the Next.js fetch layer (revalidate=60), so this rarely re-queries.
 *
 * Designed to be screenshot-friendly: clean numbers, readable on mobile,
 * works as marketing material out of the box.
 */

import { Bot, Coins, TrendingUp } from "lucide-react";

import type { EarnPublicStatsOut } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<
  Locale,
  {
    activeBots: string;
    totalLent: string;
    avgApr30d: string;
    avgAprFootnote: string;
    aprPlaceholder: string;
    suffixK: string;
    suffixM: string;
  }
> = {
  "zh-TW": {
    activeBots: "機器人運轉中",
    totalLent: "已放貸總額",
    avgApr30d: "30 天平均 APR",
    avgAprFootnote: "全平台加權平均",
    aprPlaceholder: "計算中",
    suffixK: "K",
    suffixM: "M",
  },
  en: {
    activeBots: "Bots running",
    totalLent: "Total lent",
    avgApr30d: "30-day avg APR",
    avgAprFootnote: "Platform-wide weighted",
    aprPlaceholder: "Computing",
    suffixK: "K",
    suffixM: "M",
  },
  ja: {
    activeBots: "稼働中ボット",
    totalLent: "貸付総額",
    avgApr30d: "30 日平均 APR",
    avgAprFootnote: "プラットフォーム加重平均",
    aprPlaceholder: "計算中",
    suffixK: "K",
    suffixM: "M",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsdCompact(s: string, suffixes: { K: string; M: string }): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}${suffixes.M}`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}${suffixes.K}`;
  }
  return `$${n.toFixed(2)}`;
}

export function PublicStatsStrip({
  locale,
  stats,
}: {
  locale: string;
  stats: EarnPublicStatsOut;
}) {
  const s = STRINGS[pickLocale(locale)];
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl border border-cream-edge bg-cream-warm/40 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:gap-4 sm:p-4">
      <Stat
        icon={<Bot className="h-4 w-4 text-emerald-600" />}
        label={s.activeBots}
        value={stats.active_bots_count.toLocaleString()}
      />
      <Stat
        icon={<Coins className="h-4 w-4 text-amber-600" />}
        label={s.totalLent}
        value={fmtUsdCompact(stats.total_lent_usdt, {
          K: s.suffixK,
          M: s.suffixM,
        })}
      />
      <Stat
        icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
        label={s.avgApr30d}
        value={
          stats.avg_apr_30d_pct !== null
            ? `${Number(stats.avg_apr_30d_pct).toFixed(2)}%`
            : s.aprPlaceholder
        }
        sub={stats.avg_apr_30d_pct !== null ? s.avgAprFootnote : undefined}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="mb-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 sm:justify-start sm:text-[11px]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="font-mono text-base font-bold tabular-nums sm:text-xl">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10px] text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}
