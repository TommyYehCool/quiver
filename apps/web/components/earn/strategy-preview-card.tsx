"use client";

/**
 * StrategyPreviewCard — F-5a-3.10d: dry-run preview of the smart strategy
 * selector with full per-tranche reasoning + market signals breakdown.
 *
 * Calls /api/earn/strategy-preview on mount with the user's current preset
 * + actual deployable capital. User can override preset and amount to
 * explore "what if I switched to Aggressive" or "what if I deposited
 * $5000 right now".
 *
 * No mutations — purely informational. The strategy debugger we always
 * needed.
 */

import * as React from "react";
import { useLocale } from "next-intl";
import { Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewStrategy, type StrategyPreviewOut } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";

interface CardStrings {
  title: string;
  desc: string;
  loading: string;
  refresh: string;
  errorPrefix: string;
  preset: string;
  amount: string;
  amountHint: string;
  presetConservative: string;
  presetBalanced: string;
  presetAggressive: string;
  avgApr: string;
  frrNow: string;
  vsFrr: (delta: string) => string;
  fallbackBadge: string;
  tranchesTitle: string;
  signalsTitle: string;
  signalNoData: string;
  amountUnit: string;
  daysUnit: string;
  rateFrr: string;
  notes: string;
  empty: string;
}

const STRINGS: Record<Locale, CardStrings> = {
  "zh-TW": {
    title: "策略預覽",
    desc: "F-5a-3.10 智慧選擇器:依即時市場信號決定 (利率, 期間, 金額) 組合。可改 preset / 金額試算。",
    loading: "計算中...",
    refresh: "重新整理",
    errorPrefix: "失敗:",
    preset: "策略",
    amount: "金額 (USDT)",
    amountHint: "留空 = 你目前可部署資金",
    presetConservative: "保守 (Conservative)",
    presetBalanced: "平衡 (Balanced)",
    presetAggressive: "積極 (Aggressive)",
    avgApr: "預估加權 APR",
    frrNow: "當前 FRR",
    vsFrr: (delta) => `vs FRR ${delta}`,
    fallbackBadge: "⚠ fallback (信號不足)",
    tranchesTitle: "策略拆解",
    signalsTitle: "各期間市場信號 (近 30 分鐘)",
    signalNoData: "—",
    amountUnit: "USDT",
    daysUnit: "天",
    rateFrr: "FRR 市場單",
    notes: "備註",
    empty: "尚無資料",
  },
  en: {
    title: "Strategy preview",
    desc: "F-5a-3.10 smart selector: picks (rate, period, amount) tranches from live market signals. Override preset or amount to explore.",
    loading: "Computing...",
    refresh: "Refresh",
    errorPrefix: "Failed: ",
    preset: "Preset",
    amount: "Amount (USDT)",
    amountHint: "Leave empty = your current deployable capital",
    presetConservative: "Conservative",
    presetBalanced: "Balanced",
    presetAggressive: "Aggressive",
    avgApr: "Estimated weighted APR",
    frrNow: "Current FRR",
    vsFrr: (delta) => `vs FRR ${delta}`,
    fallbackBadge: "⚠ fallback (insufficient signal)",
    tranchesTitle: "Strategy breakdown",
    signalsTitle: "Per-period signals (last 30 min)",
    signalNoData: "—",
    amountUnit: "USDT",
    daysUnit: "d",
    rateFrr: "FRR market",
    notes: "Notes",
    empty: "No data",
  },
  ja: {
    title: "戦略プレビュー",
    desc: "F-5a-3.10 スマートセレクター:リアルタイムの市場シグナルから (利率、期間、金額) を選定。preset・金額を変えて試算可能。",
    loading: "計算中...",
    refresh: "更新",
    errorPrefix: "失敗: ",
    preset: "戦略",
    amount: "金額 (USDT)",
    amountHint: "空欄 = 現在の配備可能資金",
    presetConservative: "保守 (Conservative)",
    presetBalanced: "バランス (Balanced)",
    presetAggressive: "積極 (Aggressive)",
    avgApr: "予想加重 APR",
    frrNow: "現在の FRR",
    vsFrr: (delta) => `FRR 比 ${delta}`,
    fallbackBadge: "⚠ フォールバック (シグナル不足)",
    tranchesTitle: "戦略の内訳",
    signalsTitle: "期間別シグナル (過去 30 分)",
    signalNoData: "—",
    amountUnit: "USDT",
    daysUnit: "日",
    rateFrr: "FRR マーケット",
    notes: "備考",
    empty: "データなし",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  const abs = Math.abs(n);
  let min: number, max: number;
  if (abs === 0) { min = 2; max = 2; }
  else if (abs < 0.01) { min = 2; max = 8; }
  else if (abs < 1) { min = 2; max = 4; }
  else { min = 2; max = 2; }
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max })}`;
}

export function StrategyPreviewCard({ initialPreset }: { initialPreset: string }) {
  const s = STRINGS[pickLocale(useLocale())];
  const [preset, setPreset] = React.useState(initialPreset);
  const [amount, setAmount] = React.useState("");  // empty = use server default
  const [data, setData] = React.useState<StrategyPreviewOut | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const fetchPreview = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const result = await previewStrategy({
        preset,
        amount: amount.trim() ? amount.trim() : undefined,
      });
      setData(result);
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "unknown error";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [preset, amount]);

  // Auto-fetch on mount + whenever preset changes (but not on every keystroke
  // of amount — user clicks Refresh manually for that)
  React.useEffect(() => {
    fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const aprDelta = React.useMemo(() => {
    if (!data?.frr_apr_pct) return null;
    const delta = Number(data.avg_apr_pct) - Number(data.frr_apr_pct);
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(2)}%`;
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              {s.title}
              {data?.fallback_used && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {s.fallbackBadge}
                </span>
              )}
            </CardTitle>
            <CardDescription>{s.desc}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchPreview}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {s.refresh}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="preview-preset">{s.preset}</Label>
            <select
              id="preview-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded-md border border-cream-edge bg-paper p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="conservative">{s.presetConservative}</option>
              <option value="balanced">{s.presetBalanced}</option>
              <option value="aggressive">{s.presetAggressive}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="preview-amount">{s.amount}</Label>
            <Input
              id="preview-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={fetchPreview}
              placeholder={data?.amount ?? ""}
              disabled={loading}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">{s.amountHint}</p>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {s.errorPrefix}{err}
          </div>
        )}

        {/* Headline numbers */}
        {data && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs text-slate-500">{s.avgApr}</div>
              <div className="font-mono text-2xl text-emerald-600">
                {data.avg_apr_pct}%
                {aprDelta && (
                  <span className="ml-2 text-sm text-slate-500">{s.vsFrr(aprDelta)}</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs text-slate-500">{s.frrNow}</div>
              <div className="font-mono text-2xl">
                {data.frr_apr_pct ? `${data.frr_apr_pct}%` : s.signalNoData}
              </div>
            </div>
          </div>
        )}

        {/* Tranches */}
        {data && data.tranches.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              {s.tranchesTitle}
            </div>
            <div className="space-y-2">
              {data.tranches.map((t, i) => (
                <div
                  key={i}
                  className="rounded-md border border-cream-edge bg-paper p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono">{fmtUsd(t.amount)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                      {t.rate_daily === null
                        ? s.rateFrr
                        : `${t.apr_pct}% APR`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t.period_days} {s.daysUnit}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signals table */}
        {data && data.signals.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium">{s.signalsTitle}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                    <th className="py-2">{s.daysUnit}</th>
                    <th className="py-2 text-right">APR</th>
                    <th className="py-2 text-right">{s.amountUnit} (30m)</th>
                    <th className="py-2 text-right">trades</th>
                  </tr>
                </thead>
                <tbody>
                  {data.signals.map((sig) => (
                    <tr
                      key={sig.period_days}
                      className={
                        "border-b border-cream-edge/50 dark:border-slate-800 " +
                        (sig.has_signal ? "" : "opacity-50")
                      }
                    >
                      <td className="py-2 font-mono">{sig.period_days}d</td>
                      <td className="py-2 text-right font-mono">
                        {sig.has_signal ? `${sig.median_apr_pct}%` : s.signalNoData}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {sig.has_signal ? fmtUsd(sig.volume_30min_usdt) : s.signalNoData}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {sig.has_signal ? sig.trade_count_30min : s.signalNoData}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {data && data.notes.length > 0 && (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
            <div className="mb-1 font-medium">{s.notes}</div>
            <ul className="list-disc pl-5">
              {data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
