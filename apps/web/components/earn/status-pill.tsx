/**
 * Small colored status pill used on Earn-page KPI cards.
 *
 * Visual pattern: small uppercase label inside a rounded chip with semi-
 * transparent colored bg + matching border. Pairs with a left-accent bar
 * on the parent Card (use `accentBarClass(tone)` helper).
 *
 * Tones map to semantic states across the Earn dashboard:
 *   emerald  → earning / above baseline / positive
 *   amber    → pending / waiting / mid-baseline
 *   red      → below baseline / overdue / concerning
 *   slate    → neutral / no data
 */

import { cn } from "@/lib/utils";

export type PillTone = "emerald" | "amber" | "red" | "slate";

const PILL_CLASS: Record<PillTone, string> = {
  emerald:
    "border-emerald-400/60 bg-emerald-500/15 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300",
  amber:
    "border-amber-400/60 bg-amber-500/15 text-amber-700 dark:border-amber-500/40 dark:text-amber-300",
  red:
    "border-red-400/60 bg-red-500/15 text-red-700 dark:border-red-500/40 dark:text-red-300",
  slate:
    "border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-300",
};

const ACCENT_BAR_CLASS: Record<PillTone, string> = {
  emerald: "border-l-4 border-l-emerald-500 dark:border-l-emerald-400",
  amber: "border-l-4 border-l-amber-500 dark:border-l-amber-400",
  red: "border-l-4 border-l-red-500 dark:border-l-red-400",
  slate: "border-l-4 border-l-slate-300 dark:border-l-slate-600",
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
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
