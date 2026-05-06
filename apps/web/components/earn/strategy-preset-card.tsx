"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Loader2, Shield, Scale, Zap } from "lucide-react";

import { updateEarnSettings, type EarnStrategyPreset } from "@/lib/api/earn-user";
import { cn } from "@/lib/utils";

type Locale = "zh-TW" | "en" | "ja";

interface PresetCopy {
  label: string;
  blurb: string;
  bullets: string[];
}

const STRINGS: Record<
  Locale,
  {
    title: string;
    subtitle: string;
    saved: string;
    failed: string;
    presets: Record<EarnStrategyPreset, PresetCopy>;
  }
> = {
  "zh-TW": {
    title: "策略類型",
    subtitle:
      "選一個風險偏好，Quiver 會用對應的方式切分階梯掛單、選擇鎖定天數。\n隨時可換，下一次新存入或自動續借就會生效。",
    saved: "已儲存",
    failed: "儲存失敗",
    presets: {
      conservative: {
        label: "保守",
        blurb: "8 成資金壓在最快成交的基礎利率，鎖定天數最長 7 天。\n適合想隨時取回的人。",
        bullets: [
          "階梯配置：80% 基礎 / 15% 小幅飆漲 / 5% 中度飆漲",
          "鎖定天數：最長 7 天(高利率也不長鎖)",
          "犧牲爆炸性飆漲收益，換取流動性",
        ],
      },
      balanced: {
        label: "平衡",
        blurb: "Quiver 預設策略：\n6 成基礎成交快，3.4 成等待利率飆漲，鎖定 2 / 7 / 14 / 30 天分層。",
        bullets: [
          "階梯配置：60 / 20 / 10 / 7 / 3(五階)",
          "鎖定天數：2 / 7 / 14 / 30 天動態切換",
          "兼顧成交速度與飆漲收益(預設)",
        ],
      },
      aggressive: {
        label: "進取",
        blurb: "更多資金壓在中高利率階段，極端飆漲鎖到 60 天。\n想極大化波動利潤的人。",
        bullets: [
          "階梯配置：40 / 25 / 15 / 12 / 8(重押飆漲)",
          "鎖定天數：最長 60 天(年化 20%+ 時鎖長)",
          "資金可能較長時間無法取回，但飆漲行情抓得更滿",
        ],
      },
    },
  },
  en: {
    title: "Strategy preset",
    subtitle:
      "Pick a risk preference. Quiver will use the matching ladder split + period table. Switch any time — applies to the next deposit or auto-renew cycle.",
    saved: "Saved",
    failed: "Save failed",
    presets: {
      conservative: {
        label: "Conservative",
        blurb: "80% on the fastest-fill baseline rate, lock-up capped at 7 days — for users who may want to withdraw soon.",
        bullets: [
          "Ladder: 80% baseline / 15% mild / 5% moderate",
          "Period: capped at 7 days (no long lock-ins)",
          "Trades upside spike capture for liquidity",
        ],
      },
      balanced: {
        label: "Balanced",
        blurb: "Quiver's default — 60% baseline for fast fill, 34% chasing spikes, lock-ups 2 / 7 / 14 / 30 days.",
        bullets: [
          "Ladder: 60 / 20 / 10 / 7 / 3 (five tiers)",
          "Period: dynamic 2 / 7 / 14 / 30 days",
          "Balances fill speed and spike capture (default)",
        ],
      },
      aggressive: {
        label: "Aggressive",
        blurb: "More weight on mid-to-high tranches, extreme spikes locked up to 60 days — to maximise volatility profit.",
        bullets: [
          "Ladder: 40 / 25 / 15 / 12 / 8 (heavy on spikes)",
          "Period: up to 60 days (20%+ APR locked long)",
          "Funds may be unavailable longer, but spike capture is fuller",
        ],
      },
    },
  },
  ja: {
    title: "戦略プリセット",
    subtitle:
      "リスク選好を選んでください。Quiver はそれに合わせたラダー分割と期間テーブルを使います。いつでも変更可能 — 次の入金または自動更新から反映されます。",
    saved: "保存しました",
    failed: "保存失敗",
    presets: {
      conservative: {
        label: "保守的",
        blurb: "資金の 80% を最速約定のベースレートに、ロックは最長 7 日 — すぐ引き出したい人向け。",
        bullets: [
          "ラダー:80% ベース / 15% 小波 / 5% 中波",
          "ロック期間:最長 7 日(高金利でも長ロックしない)",
          "スパイク利益を犠牲に流動性を確保",
        ],
      },
      balanced: {
        label: "バランス",
        blurb: "Quiver 既定 — 60% は速い約定、34% でスパイク捕獲、ロック 2 / 7 / 14 / 30 日。",
        bullets: [
          "ラダー:60 / 20 / 10 / 7 / 3(5 段階)",
          "ロック期間:2 / 7 / 14 / 30 日で動的切替",
          "約定速度とスパイク収益のバランス(既定)",
        ],
      },
      aggressive: {
        label: "アグレッシブ",
        blurb: "中〜高金利ラダーに多めに振り、極端なスパイクは最大 60 日ロック — ボラ利益を最大化。",
        bullets: [
          "ラダー:40 / 25 / 15 / 12 / 8(スパイク重視)",
          "ロック期間:最大 60 日(APR 20%+ は長期ロック)",
          "引き出しに時間がかかる可能性、ただしスパイクをしっかり捕獲",
        ],
      },
    },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

const PRESETS: EarnStrategyPreset[] = ["conservative", "balanced", "aggressive"];

const PRESET_ICON: Record<EarnStrategyPreset, typeof Shield> = {
  conservative: Shield,
  balanced: Scale,
  aggressive: Zap,
};

const PRESET_ACCENT: Record<EarnStrategyPreset, string> = {
  conservative:
    "border-sky-300 bg-sky-50/70 ring-sky-400 dark:border-sky-800 dark:bg-sky-950/40",
  balanced:
    "border-emerald-300 bg-emerald-50/70 ring-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40",
  aggressive:
    "border-amber-300 bg-amber-50/70 ring-amber-400 dark:border-amber-800 dark:bg-amber-950/40",
};

const PRESET_ICON_COLOR: Record<EarnStrategyPreset, string> = {
  conservative: "text-sky-600 dark:text-sky-400",
  balanced: "text-emerald-600 dark:text-emerald-400",
  aggressive: "text-amber-600 dark:text-amber-400",
};

export function StrategyPresetCard({
  initial,
}: {
  initial: EarnStrategyPreset;
}) {
  const router = useRouter();
  const s = STRINGS[pickLocale(useLocale())];
  const [selected, setSelected] = React.useState<EarnStrategyPreset>(initial);
  const [busy, setBusy] = React.useState<EarnStrategyPreset | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [savedFlash, setSavedFlash] = React.useState(false);

  async function handlePick(next: EarnStrategyPreset) {
    if (next === selected || busy) return;
    setBusy(next);
    setErr(null);
    try {
      const r = await updateEarnSettings({ strategy_preset: next });
      setSelected(r.strategy_preset);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? s.failed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {PRESETS.map((preset) => {
          const copy = s.presets[preset];
          const Icon = PRESET_ICON[preset];
          const isActive = selected === preset;
          const isBusy = busy === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => handlePick(preset)}
              disabled={busy !== null}
              aria-pressed={isActive}
              className={cn(
                "flex flex-col items-stretch gap-2 rounded-xl border p-4 text-left transition-all duration-150 focus:outline-none focus:ring-2 disabled:opacity-50",
                isActive
                  ? `${PRESET_ACCENT[preset]} ring-2`
                  : "border-cream-edge bg-white/40 hover:border-slate-300 hover:bg-white/70 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-900/60",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "h-5 w-5 flex-none",
                    isActive ? PRESET_ICON_COLOR[preset] : "text-slate-400",
                  )}
                />
                <span className="text-sm font-semibold">{copy.label}</span>
                {isBusy ? (
                  <Loader2 className="ml-auto h-4 w-4 flex-none animate-spin text-slate-400" />
                ) : null}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {copy.blurb}
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
                {copy.bullets.map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <div className="flex h-5 items-center justify-end gap-2 text-xs">
        {savedFlash ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ {s.saved}
          </span>
        ) : null}
        {err ? <span className="text-red-500">{err}</span> : null}
      </div>
    </div>
  );
}
