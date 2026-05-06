/**
 * Small colored status pill used on Earn-page KPI cards.
 *
 * Visual pattern: small uppercase label inside a rounded chip with semi-
 * transparent colored bg + stronger colored border (modeled on the VIP
 * rank popup HTML sample). Pairs with an accentBarClass + cardToneClass
 * on the parent Card for a coherent "the whole card glows in this tone"
 * look.
 *
 * Tones map to semantic states across the Earn dashboard:
 *   emerald  → earning / above baseline / positive
 *   amber    → pending / mid-baseline
 *   red      → idle / below baseline / concerning
 *   slate    → neutral / no data
 */

import { cn } from "@/lib/utils";

export type PillTone = "emerald" | "amber" | "red" | "slate";

const PILL_CLASS: Record<PillTone, string> = {
  emerald:
    "border-emerald-400/90 bg-emerald-500/20 text-emerald-700 shadow-[0_0_8px_rgba(16,185,129,0.25)] dark:border-emerald-400 dark:bg-emerald-500/25 dark:text-emerald-200",
  amber:
    "border-amber-400/90 bg-amber-500/20 text-amber-800 shadow-[0_0_8px_rgba(245,158,11,0.25)] dark:border-amber-400 dark:bg-amber-500/25 dark:text-amber-200",
  red:
    "border-red-400/90 bg-red-500/20 text-red-700 shadow-[0_0_8px_rgba(239,68,68,0.25)] dark:border-red-400 dark:bg-red-500/25 dark:text-red-200",
  slate:
    "border-slate-400/70 bg-slate-300/40 text-slate-700 dark:border-slate-500 dark:bg-slate-600/40 dark:text-slate-200",
};

const ACCENT_BAR_CLASS: Record<PillTone, string> = {
  emerald: "border-l-[6px] border-l-emerald-500 dark:border-l-emerald-400",
  amber: "border-l-[6px] border-l-amber-500 dark:border-l-amber-400",
  red: "border-l-[6px] border-l-red-500 dark:border-l-red-400",
  slate: "border-l-[6px] border-l-slate-300 dark:border-l-slate-600",
};

/**
 * Tone-tinted card border + subtle glow. Combine with accentBarClass to
 * get the full "card themed by tone" effect.
 */
const CARD_TONE_CLASS: Record<PillTone, string> = {
  emerald:
    "border-emerald-300/40 dark:border-emerald-500/30 dark:shadow-[0_0_24px_rgba(16,185,129,0.08)]",
  amber:
    "border-amber-300/40 dark:border-amber-500/30 dark:shadow-[0_0_24px_rgba(245,158,11,0.08)]",
  red:
    "border-red-300/40 dark:border-red-500/30 dark:shadow-[0_0_24px_rgba(239,68,68,0.08)]",
  slate: "border-slate-300/40 dark:border-slate-600/40",
};

export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: PillTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        PILL_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Returns the className for the parent card's left-accent bar. */
export function accentBarClass(tone: PillTone): string {
  return ACCENT_BAR_CLASS[tone];
}

/** Returns tone-tinted border + subtle glow for the parent card. */
export function cardToneClass(tone: PillTone): string {
  return CARD_TONE_CLASS[tone];
}
