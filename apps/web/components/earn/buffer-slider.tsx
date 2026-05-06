"use client";

/**
 * BufferSlider — F-5a-3.11 「保留不借出金額」 control.
 *
 * Lets the user pick what % of new deposits stays in their Quiver wallet
 * (instant redemption, no Bitfinex bridge) vs goes through the auto-lend
 * pipeline. Per Tommy's design (Q4):
 *
 *   - Slider 0..50 (we cap at 50 because higher buffer means most of the
 *     deposit doesn't earn interest at all — Quiver isn't a vault product)
 *   - Default 0 (max yield, no instant-redeem headroom)
 *   - Applies to NEW deposits only — changing this doesn't auto-rebalance
 *     existing capital at Bitfinex (clearly stated in the helper text)
 *
 * Lives in /earn/bot-settings under the Auto-lend toggle. Uses the same
 * PATCH /api/earn/settings as auto-lend toggle + strategy preset.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Loader2 } from "lucide-react";

import { updateEarnSettings } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";

interface SliderStrings {
  title: string;
  desc: string;
  hint: (pct: number) => string;
  bridgeLabel: (bridgePct: number) => string;
  bufferLabel: (bufferPct: number) => string;
  rebalanceNote: string;
  errorPrefix: string;
}

const STRINGS: Record<Locale, SliderStrings> = {
  "zh-TW": {
    title: "保留不借出金額",
    desc: "新存入的 USDT 之中，有多少比例留在 Quiver 錢包(隨時可提現)，其他自動送到 Bitfinex 借出賺息。",
    hint: (pct) =>
      pct === 0
        ? "全部送 Bitfinex 借出 → 最高收益,但贖回要等 active credits 到期"
        : pct >= 30
          ? `留 ${pct}% 在 Quiver → 即時可贖,但少賺對應比例的利息`
          : `留 ${pct}% 緩衝 → 平衡贖回靈活度跟收益`,
    bridgeLabel: (bridgePct) => `送 Bitfinex ${bridgePct}%`,
    bufferLabel: (bufferPct) => `留 Quiver ${bufferPct}%`,
    rebalanceNote: "* 改設定只影響「之後的新 deposit」,不會把已在 Bitfinex 的錢拉回來",
    errorPrefix: "失敗:",
  },
  en: {
    title: "Buffer (kept in Quiver)",
    desc: "Fraction of each new USDT deposit that stays in your Quiver wallet (instant redeem) vs. is bridged to Bitfinex for lending.",
    hint: (pct) =>
      pct === 0
        ? "All deposits bridge to Bitfinex → max yield, but redeem waits for credit maturity"
        : pct >= 30
          ? `${pct}% stays in Quiver → instant redeem, forgoes interest on that slice`
          : `${pct}% buffer → balance between redeem flexibility and yield`,
    bridgeLabel: (bridgePct) => `Bridge ${bridgePct}%`,
    bufferLabel: (bufferPct) => `Keep ${bufferPct}%`,
    rebalanceNote: "* Changes only affect FUTURE deposits — existing capital at Bitfinex is not pulled back",
    errorPrefix: "Failed: ",
  },
  ja: {
    title: "貸し出さない保留率",
    desc: "新規入金 USDT のうち、Quiver ウォレット側に残す(即時引出可)割合と、Bitfinex に送って貸し出す割合。",
    hint: (pct) =>
      pct === 0
        ? "全額 Bitfinex に送付 → 最大収益、引出は credit 満期まで待機"
        : pct >= 30
          ? `${pct}% を Quiver に残す → 即時引出可、その分の利息は放棄`
          : `${pct}% 保留 → 引出柔軟性と収益のバランス`,
    bridgeLabel: (bridgePct) => `Bitfinex に ${bridgePct}%`,
    bufferLabel: (bufferPct) => `Quiver に ${bufferPct}%`,
    rebalanceNote: "* 設定変更は今後の入金にのみ適用 — Bitfinex の既存資金は戻されません",
    errorPrefix: "失敗: ",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export function BufferSlider({ initialPct }: { initialPct: number }) {
  const router = useRouter();
  const s = STRINGS[pickLocale(useLocale())];

  // Local UI state — instant feedback while dragging; commit on slide-end
  // (or when value differs from server) via PATCH.
  const [pct, setPct] = React.useState(initialPct);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function commit(newPct: number) {
    if (newPct === initialPct) return;
    setBusy(true);
    setErr(null);
    try {
      await updateEarnSettings({ usdt_buffer_pct: newPct });
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "unknown error";
      setErr(`${s.errorPrefix}${msg}`);
      // Roll back to last-known-server value so UI doesn't lie
      setPct(initialPct);
    } finally {
      setBusy(false);
    }
  }

  const bridgePct = 100 - pct;

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {s.title}
          </h3>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        <p className="text-xs text-slate-500">{s.desc}</p>
      </div>

      {/* Slider + values */}
      <div>
        <input
          type="range"
          min={0}
          max={50}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          onMouseUp={() => commit(pct)}
          onTouchEnd={() => commit(pct)}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") commit(pct);
          }}
          disabled={busy}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-cream-edge accent-brand dark:bg-slate-700"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {s.bufferLabel(pct)}
          </span>
          <span className="text-slate-400">|</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {s.bridgeLabel(bridgePct)}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500">{s.hint(pct)}</p>
      <p className="text-[11px] text-slate-400 italic">{s.rebalanceNote}</p>

      {err && (
        <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
          {err}
        </div>
      )}
    </div>
  );
}
