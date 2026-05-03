"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Loader2 } from "lucide-react";

import { updateEarnSettings } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";
const STRINGS: Record<Locale, { on: string; off: string; failed: string }> = {
  "zh-TW": { on: "已開啟", off: "已關閉", failed: "操作失敗" },
  en: { on: "On", off: "Off", failed: "Failed" },
  ja: { on: "オン", off: "オフ", failed: "失敗" },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export function AutoLendToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const s = STRINGS[pickLocale(useLocale())];
  const [enabled, setEnabled] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleToggle() {
    setBusy(true);
    setErr(null);
    const next = !enabled;
    try {
      const r = await updateEarnSettings({ auto_lend_enabled: next });
      setEnabled(r.auto_lend_enabled);
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? s.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        aria-pressed={enabled}
        className={
          "relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors disabled:opacity-50 " +
          (enabled
            ? "bg-emerald-500"
            : "bg-slate-300 dark:bg-slate-700")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
            (enabled ? "translate-x-6" : "translate-x-1")
          }
        />
        {busy && (
          <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" />
        )}
      </button>
      <span className="text-xs text-slate-500">{enabled ? s.on : s.off}</span>
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}
