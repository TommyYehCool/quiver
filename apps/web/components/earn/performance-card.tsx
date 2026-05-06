/**
 * F-5b-1 — Per-user strategy performance card on /earn.
 *
 * Proves the bot is working: shows weighted APR vs FRR baseline, 30-day
 * interest, spike capture count, best active tranche, and a daily-earnings
 * sparkline. Server component (data is server-fetched on /earn).
 */

import { Sparkles, TrendingUp, Zap } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EarnPerformanceOut } from "@/lib/api/earn-user";
import { cn } from "@/lib/utils";
import { StatusPill, accentBarClass, type PillTone } from "@/components/earn/status-pill";

type Locale = "zh-TW" | "en" | "ja";

interface PerfStrings {
  title: string;
  subtitle: string;
  weightedAprLabel: string;
  vsFrrAbove: (delta: string) => string;
  vsFrrBelow: (delta: string) => string;
  vsFrrEqual: string;
  baselineFrr: (apr: string) => string;
  totalInterest30d: string;
  daysWithData: (n: number) => string;
  spikeCaptured: string;
  spikeNone: string;
  spikeAmount: (usdt: string) => string;
  bestApr: string;
  bestAprNone: string;
  ladderLabel: string;
  ladderNone: string;
  trendLabel: string;
  trendEmpty: string;
  noDataYet: string;
  // F-5b-X.4 realized APR
  realized30dLabel: string;
  realized7dLabel: string;
  realizedNotReady: string;
  realizedHint: string;
  // 三色狀態 pill 標籤
  pills: {
    above: string;
    equal: string;
    below: string;
    realized30d: string;
    realized7d: string;
    earned: string;
    spikeCaptured: string;
    spikeNone: string;
    bestApr: string;
  };
}

const STRINGS: Record<Locale, PerfStrings> = {
  "zh-TW": {
    title: "策略表現",
    subtitle: "你的階梯掛單真的賺到錢的證據對照。\nBitfinex 浮動利率(FRR)，看 Quiver 多賺了多少。",
    weightedAprLabel: "加權平均年化",
    vsFrrAbove: (delta) => `比浮動利率高 +${delta}%`,
    vsFrrBelow: (delta) => `比浮動利率低 ${delta}%`,
    vsFrrEqual: "與浮動利率持平",
    baselineFrr: (apr) => `市場浮動利率基準 ${apr}%`,
    totalInterest30d: "30 天累計利息",
    daysWithData: (n) => `${n} 天有資料`,
    spikeCaptured: "飆漲行情捕捉",
    spikeNone: "目前沒有飆漲部位",
    spikeAmount: (usdt) => `共 $${usdt} 鎖在飆漲利率`,
    bestApr: "目前最高的單階年化",
    bestAprNone: "尚無在借出部位",
    ladderLabel: "階梯掛單已部署",
    ladderNone: "—",
    trendLabel: "30 天日利息走勢",
    trendEmpty: "等待第一筆每日資料(每天 03:00 排程產生)",
    noDataYet:
      "你的部位剛建立，Quiver 還在收第一批資料。\n掛單後 1-2 天會看到第一筆每日結算，再過 7-10 天走勢圖才有意思。",
    realized30dLabel: "已實現年化(30 天)",
    realized7dLabel: "已實現年化(7 天)",
    realizedNotReady: "資料天數不足",
    realizedHint: "回看實際成交利率(已扣 Bitfinex 手續費)，抓到 spike 時這個數字會跳很高",
    pills: {
      above: "優於基準",
      equal: "持平",
      below: "低於基準",
      realized30d: "30 天",
      realized7d: "7 天",
      earned: "已賺",
      spikeCaptured: "已捕捉",
      spikeNone: "無 spike",
      bestApr: "最佳",
    },
  },
  en: {
    title: "Strategy performance",
    subtitle: "Proof your ladder is actually earning — compared to the FRR baseline rate, see how much Quiver beat the market by.",
    weightedAprLabel: "Weighted average APR",
    vsFrrAbove: (delta) => `+${delta}% above FRR`,
    vsFrrBelow: (delta) => `${delta}% below FRR`,
    vsFrrEqual: "Matches FRR",
    baselineFrr: (apr) => `Market FRR baseline ${apr}%`,
    totalInterest30d: "Interest earned (30d)",
    daysWithData: (n) => `${n} day${n === 1 ? "" : "s"} of data`,
    spikeCaptured: "Spikes captured",
    spikeNone: "No spike positions right now",
    spikeAmount: (usdt) => `$${usdt} at spike rates`,
    bestApr: "Highest active tranche APR",
    bestAprNone: "No active loans yet",
    ladderLabel: "Ladder deployed",
    ladderNone: "—",
    trendLabel: "30-day daily interest trend",
    trendEmpty: "Waiting for first snapshot (daily cron)",
    noDataYet:
      "Your position was just set up. Quiver is still collecting the first batch of data — you'll see the first daily settlement 1-2 days after offers go live, and the sparkline becomes meaningful after 7-10 days.",
    realized30dLabel: "Realized APR (30d)",
    realized7dLabel: "Realized APR (7d)",
    realizedNotReady: "Building data",
    realizedHint: "What you actually earned, annualized (Bitfinex fees deducted). Jumps high when you catch spikes.",
    pills: {
      above: "Above",
      equal: "On baseline",
      below: "Below",
      realized30d: "30D",
      realized7d: "7D",
      earned: "Earned",
      spikeCaptured: "Captured",
      spikeNone: "No spike",
      bestApr: "Best",
    },
  },
  ja: {
    title: "戦略パフォーマンス",
    subtitle: "ラダーが実際に収益を上げている証拠 — Bitfinex の浮動金利(FRR)と比較して、Quiver がどれだけ市場を上回ったかを表示。",
    weightedAprLabel: "加重平均 APR",
    vsFrrAbove: (delta) => `浮動金利より +${delta}% 高い`,
    vsFrrBelow: (delta) => `浮動金利より ${delta}% 低い`,
    vsFrrEqual: "浮動金利と同等",
    baselineFrr: (apr) => `市場の浮動金利基準 ${apr}%`,
    totalInterest30d: "30 日累計利息",
    daysWithData: (n) => `${n} 日分のデータ`,
    spikeCaptured: "金利急騰の捕獲",
    spikeNone: "現在、急騰ポジションはありません",
    spikeAmount: (usdt) => `$${usdt} を急騰金利で運用中`,
    bestApr: "現在最高の段の APR",
    bestAprNone: "貸出ポジションなし",
    ladderLabel: "ラダー展開済み",
    ladderNone: "—",
    trendLabel: "30 日日次利息トレンド",
    trendEmpty: "初回スナップショット待ち(毎日 03:00 の定期処理で生成)",
    noDataYet:
      "ポジションが設定されたばかりです。Quiver は最初のデータバッチを収集中 — オファーが有効になってから 1-2 日後に最初の日次結算が表示され、7-10 日後にスパークラインが意味を持ち始めます。",
    realized30dLabel: "実現 APR (30 日)",
    realized7dLabel: "実現 APR (7 日)",
    realizedNotReady: "データ収集中",
    realizedHint: "実際の約定金利を年率換算(Bitfinex 手数料控除済)。spike を捕獲すると数値が跳ねます。",
    pills: {
      above: "基準超え",
      equal: "基準",
      below: "基準未満",
      realized30d: "30 日",
      realized7d: "7 日",
      earned: "獲得",
      spikeCaptured: "捕獲",
      spikeNone: "スパイクなし",
      bestApr: "最高",
    },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(s: string | null | undefined, digits = 2): string {
  if (s === null || s === undefined) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function PerformanceCard({
  locale,
  perf,
}: {
  locale: string;
  perf: EarnPerformanceOut;
}) {
  const s = STRINGS[pickLocale(locale)];

  // Show empty state if user has no data at all (just connected, no snapshots,
  // no active credits).
  const hasAnyData =
    perf.weighted_avg_apr_pct !== null ||
    perf.active_credits_count > 0 ||
    perf.days_with_data > 0;

  if (!hasAnyData) {
    return (
      <Card className="border-emerald-200/40 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            {s.title}
          </CardTitle>
          <CardDescription className="whitespace-pre-line">{s.noDataYet}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // APR vs FRR delta for headline tone
  const delta = perf.apr_vs_frr_delta_pct;
  const deltaNum = delta !== null ? Number(delta) : null;
  const deltaTone =
    deltaNum === null
      ? "text-slate-500"
      : deltaNum > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : deltaNum < 0
          ? "text-amber-600 dark:text-amber-400"
          : "text-slate-500";
  const deltaLabel =
    deltaNum === null
      ? null
      : deltaNum > 0
        ? s.vsFrrAbove(fmtPct(delta, 2))
        : deltaNum < 0
          ? s.vsFrrBelow(fmtPct(delta, 2))
          : s.vsFrrEqual;
  // status pill for headline weighted APR (vs FRR baseline)
  const headlinePillTone: PillTone =
    deltaNum === null
      ? "slate"
      : deltaNum > 0
        ? "emerald"
        : deltaNum < 0
          ? "red"
          : "amber";
  const headlinePillLabel =
    deltaNum === null
      ? "—"
      : deltaNum > 0
        ? s.pills.above
        : deltaNum < 0
          ? s.pills.below
          : s.pills.equal;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          {s.title}
        </CardTitle>
        <CardDescription className="whitespace-pre-line">{s.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline: weighted APR + delta vs FRR */}
        <div className={cn(
          "rounded-lg border border-cream-edge bg-cream-warm/50 p-4 dark:border-slate-700 dark:bg-slate-900/40",
          accentBarClass(headlinePillTone),
        )}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {s.weightedAprLabel}
            </div>
            <StatusPill tone={headlinePillTone} label={headlinePillLabel} />
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="font-mono text-3xl font-bold tabular-nums">
                {fmtPct(perf.weighted_avg_apr_pct, 2)}
                <span className="ml-0.5 text-base font-normal text-slate-400">%</span>
              </div>
            </div>
            {deltaLabel ? (
              <div className={cn("text-right text-sm font-semibold", deltaTone)}>
                {deltaLabel}
              </div>
            ) : null}
          </div>
          {perf.current_frr_apr_pct !== null ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {s.baselineFrr(fmtPct(perf.current_frr_apr_pct, 2))}
            </div>
          ) : null}
        </div>

        {/* F-5b-X.4: realized APR — backward-looking, includes any spike
            events captured in the window. Sits below the live weighted-
            avg APR so users see the contrast: weighted = "what's
            currently posted", realized = "what actually settled". */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={cn(
            "rounded-lg border border-emerald-300/50 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20",
            accentBarClass("emerald"),
          )}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {s.realized30dLabel}
              </div>
              <StatusPill tone="emerald" label={s.pills.realized30d} />
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {perf.realized_apr_30d_pct !== null
                ? `${fmtPct(perf.realized_apr_30d_pct, 2)}%`
                : "—"}
            </div>
            {perf.realized_apr_30d_pct === null ? (
              <div className="mt-0.5 text-[11px] text-slate-500">
                {s.realizedNotReady}
              </div>
            ) : null}
          </div>
          <div className={cn(
            "rounded-lg border border-emerald-300/50 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20",
            accentBarClass("emerald"),
          )}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {s.realized7dLabel}
              </div>
              <StatusPill tone="emerald" label={s.pills.realized7d} />
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {perf.realized_apr_7d_pct !== null
                ? `${fmtPct(perf.realized_apr_7d_pct, 2)}%`
                : "—"}
            </div>
            {perf.realized_apr_7d_pct === null ? (
              <div className="mt-0.5 text-[11px] text-slate-500">
                {s.realizedNotReady}
              </div>
            ) : null}
          </div>
        </div>
        <p className="-mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">
          {s.realizedHint}
        </p>

        {/* KPI grid: interest 30d / spike count / best APR */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi
            label={s.totalInterest30d}
            value={`$${fmtUsd(perf.total_interest_30d_usdt)}`}
            sub={s.daysWithData(perf.days_with_data)}
            tone="emerald"
            pillLabel={s.pills.earned}
          />
          <Kpi
            label={s.spikeCaptured}
            value={`${perf.spike_credits_count}`}
            sub={
              perf.spike_credits_count > 0
                ? s.spikeAmount(fmtUsd(perf.spike_credits_total_usdt))
                : s.spikeNone
            }
            tone={perf.spike_credits_count > 0 ? "amber" : "slate"}
            icon={<Zap className="h-3.5 w-3.5" />}
            pillLabel={perf.spike_credits_count > 0 ? s.pills.spikeCaptured : s.pills.spikeNone}
          />
          <Kpi
            label={s.bestApr}
            value={
              perf.best_active_apr_pct !== null
                ? `${fmtPct(perf.best_active_apr_pct, 2)}%`
                : "—"
            }
            sub={
              perf.best_active_apr_pct === null
                ? s.bestAprNone
                : `${s.ladderLabel}: ${perf.active_credits_count}`
            }
            tone={
              perf.best_active_apr_pct !== null &&
              Number(perf.best_active_apr_pct) >= 12
                ? "amber"
                : "slate"
            }
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            pillLabel={s.pills.bestApr}
          />
        </div>

        {/* 30-day daily interest sparkline */}
        <div>
          <div className="mb-2 flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{s.trendLabel}</span>
          </div>
          {perf.daily_earnings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-cream-edge px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
              {s.trendEmpty}
            </div>
          ) : (
            <Sparkline rows={perf.daily_earnings} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
  pillLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "amber" | "slate";
  icon?: React.ReactNode;
  pillLabel?: string;
}) {
  const valueClass = cn(
    "font-mono text-lg font-semibold tabular-nums",
    tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
    tone === "amber" && "text-amber-600 dark:text-amber-400",
    tone === "slate" && "text-slate-700 dark:text-slate-200",
  );
  return (
    <div className={cn(
      "rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900/30",
      accentBarClass(tone as PillTone),
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        {pillLabel ? <StatusPill tone={tone as PillTone} label={pillLabel} /> : null}
      </div>
      <div className={cn("mt-1", valueClass)}>{value}</div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10px] text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}

/**
 * Pure-SVG sparkline. Server-renderable, no client JS, no external chart lib.
 * Rows are ordered by date ascending. Y-axis auto-scales from min..max of usdt
 * values; we add a tiny floor so a flat 0 series still draws a visible line.
 */
function Sparkline({
  rows,
}: {
  rows: { date: string; usdt: string }[];
}) {
  const values = rows.map((r) => Number(r.usdt) || 0);
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || max || 1;
  const width = 100;
  const height = 32;
  const stepX = rows.length > 1 ? width / (rows.length - 1) : 0;

  const pathD = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Area fill for visual depth
  const areaD = `${pathD} L${(values.length - 1) * stepX},${height} L0,${height} Z`;

  // Recent value (last) to display
  const last = values[values.length - 1] ?? 0;
  const peakIdx = values.indexOf(max);

  return (
    <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="mb-1 flex items-baseline justify-between text-[10px] text-slate-400">
        <span>{rows[0].date}</span>
        <span className="font-mono tabular-nums">
          peak ${max.toFixed(2)}
        </span>
        <span>{rows[rows.length - 1].date}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="sparkGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#sparkGradient)" />
        <path
          d={pathD}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Mark the peak */}
        {rows.length > 1 ? (
          <circle
            cx={peakIdx * stepX}
            cy={height - ((max - min) / range) * height}
            r="1.5"
            fill="rgb(245 158 11)"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <div className="mt-1 text-right text-[11px] text-emerald-600 dark:text-emerald-400">
        latest: ${last.toFixed(2)}
      </div>
    </div>
  );
}
