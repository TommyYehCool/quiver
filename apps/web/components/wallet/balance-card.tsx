"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Clock, Coins, Hourglass, TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyBalance, type Balance } from "@/lib/api/wallet";
import { fmtTwd, useUsdtTwdRate } from "@/lib/api/rates";
import { fetchEarnMe, type EarnMeOut } from "@/lib/api/earn-user";

const POLL_INTERVAL_MS = 5_000;

type Locale = "zh-TW" | "en" | "ja";
const EARN_STRINGS: Record<Locale, {
  totalTitle: string;
  totalDesc: string;
  earnLabel: string;
  earnLent: (n: string) => string;
  earnIdle: (n: string) => string;
  // F-5a-3.11.10 — per-credit detail card strings
  creditsTitle: string;
  creditOpened: string;
  creditExpires: string;
  creditApr: string;
  creditExpired: string;
}> = {
  "zh-TW": {
    totalTitle: "總資產",
    totalDesc: "Quiver 託管 + Bitfinex Earn(USDT + USD)總額",
    earnLabel: "Bitfinex 賺息",
    earnLent: (n) => `已借出 ${n}`,
    earnIdle: (n) => `等掛單 ${n}`,
    creditsTitle: "Bitfinex 借出明細",
    creditOpened: "開始",
    creditExpires: "到期",
    creditApr: "APR",
    creditExpired: "已到期",
  },
  en: {
    totalTitle: "Total Assets",
    totalDesc: "Held in Quiver custody + Bitfinex Earn (USDT + USD)",
    earnLabel: "Bitfinex Earn",
    earnLent: (n) => `Lent ${n}`,
    earnIdle: (n) => `Idle ${n}`,
    creditsTitle: "Bitfinex active credits",
    creditOpened: "Opened",
    creditExpires: "Expires",
    creditApr: "APR",
    creditExpired: "Expired",
  },
  ja: {
    totalTitle: "総資産",
    totalDesc: "Quiver と Bitfinex Earn の合計(USDT + USD)",
    earnLabel: "Bitfinex で運用中",
    earnLent: (n) => `貸出中 ${n}`,
    earnIdle: (n) => `待機 ${n}`,
    creditsTitle: "Bitfinex 貸出明細",
    creditOpened: "開始",
    creditExpires: "満期",
    creditApr: "APR",
    creditExpired: "満期済",
  },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

/**
 * 餘額卡 — Total-first design:
 *   - 大字顯示總資產(Quiver 託管 + Bitfinex Earn + 處理中)
 *   - 下方三個 chip 拆解:可動用 / 賺息中 / 處理中
 *   - 賺息中 chip 是 link → /earn,有 ↗ 指示
 *
 * 處理中 / Earn chip 只在 > 0 時才顯示,避免空欄位視覺雜訊。
 */
export function BalanceCard() {
  const t = useTranslations("balance");
  const params = useParams();
  const locale = (params?.locale as string) ?? "zh-TW";
  const es = EARN_STRINGS[pickLocale(useLocale())];
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [earn, setEarn] = React.useState<EarnMeOut | null>(null);
  const { rate } = useUsdtTwdRate();

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let hasPending = false;
      try {
        const [b, e] = await Promise.all([
          fetchMyBalance(),
          fetchEarnMe().catch(() => null),
        ]);
        if (cancelled) return;
        setBalance(b);
        if (e) setEarn(e);
        hasPending = Number(b.pending) > 0;
      } catch {
        // 靜默失敗,下次 poll 再試
      }
      if (cancelled) return;
      pollTimer = setTimeout(tick, hasPending ? POLL_INTERVAL_MS : POLL_INTERVAL_MS * 6);
    }
    tick();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const available = Number(balance?.available ?? 0);
  const pending = Number(balance?.pending ?? 0);
  // F-5a-3.11: aggregate USDT + USD positions (1:1 peg, displayed as
  // single USDT-equivalent total). Per-currency breakdown lives in the
  // active_credits detail list below the chips.
  const earnLentUsdt = Number(earn?.lent_usdt ?? 0);
  const earnLentUsd = Number(earn?.lent_usd ?? 0);
  const earnIdleUsdt = Number(earn?.funding_idle_usdt ?? 0);
  const earnIdleUsd = Number(earn?.funding_idle_usd ?? 0);
  const earnLent = earnLentUsdt + earnLentUsd;
  const earnIdle = earnIdleUsdt + earnIdleUsd;
  const earnTotal = earnLent + earnIdle;
  const total = available + earnTotal + pending;
  const showEarn = Boolean(earn?.has_earn_account) && earnTotal > 0;
  const showPending = pending > 0;
  const hasAnyBreakdown = showEarn || showPending;
  const credits = earn?.active_credits ?? [];

  // 動態決定 title:有 Earn 部位用「總資產」更精確,沒就維持原本「餘額」
  const cardTitle = hasAnyBreakdown ? es.totalTitle : t("title");
  const cardDesc = hasAnyBreakdown ? es.totalDesc : t("desc");

  return (
    <Card className="bg-macaron-mint dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
          <Coins className="h-6 w-6 text-emerald-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{cardDesc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PRIMARY:大字顯示總資產 */}
        <div>
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight">
            {fmt(total)}{" "}
            <span className="text-base font-normal text-slate-500">USDT</span>
          </p>
          {rate !== null ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ≈ {fmtTwd(String(total), rate)}{" "}
              <span className="text-xs">@ {rate.toFixed(2)}</span>
            </p>
          ) : null}
        </div>

        {/* SECONDARY:breakdown chips(只在有需要時顯示) */}
        {hasAnyBreakdown ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <BalanceChip label={t("available")} value={available} tone="neutral" />
            {showEarn ? (
              <BalanceChip
                label={es.earnLabel}
                value={earnTotal}
                tone="success"
                href={`/${locale}/earn`}
                icon={<TrendingUp className="h-3 w-3" />}
                subtitle={
                  earnLent > 0
                    ? es.earnLent(fmt(earnLent))
                    : earnIdle > 0
                      ? es.earnIdle(fmt(earnIdle))
                      : undefined
                }
              />
            ) : null}
            {showPending ? (
              <BalanceChip
                label={t("pending")}
                value={pending}
                tone="warning"
                icon={<Clock className="h-3 w-3" />}
              />
            ) : null}
          </div>
        ) : null}

        {/* F-5a-3.11.10 — per-credit detail list. Surfaces the per-loan
            currency / APR / open-expire dates Tommy asked for, without
            requiring a click into /earn. */}
        {credits.length > 0 ? (
          <div className="space-y-1.5 border-t border-emerald-300/30 pt-3 dark:border-emerald-900/40">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-800/70 dark:text-emerald-300/70">
              {es.creditsTitle}
            </p>
            <ul className="space-y-1.5">
              {credits.map((c) => {
                const opened = new Date(c.opened_at_ms);
                const expires = new Date(c.expires_at_ms);
                const isExpired = expires.getTime() <= Date.now();
                const dateOpts: Intl.DateTimeFormatOptions = {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                };
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-emerald-50/40 px-2 py-1.5 text-xs dark:bg-emerald-950/20"
                  >
                    <span className="font-mono font-semibold tabular-nums">
                      {fmt(c.amount)}
                    </span>
                    <span className="text-[10px] font-normal uppercase tracking-wider text-slate-500">
                      {c.currency || "USDT"}
                    </span>
                    <Hourglass className="ml-1 h-3 w-3 text-emerald-600/70" />
                    <span className="font-mono">
                      {Number(c.apr_pct).toFixed(2)}% {es.creditApr}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
                      {opened.toLocaleString(undefined, dateOpts)} →{" "}
                      {isExpired ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {es.creditExpired}
                        </span>
                      ) : (
                        expires.toLocaleString(undefined, dateOpts)
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface BalanceChipProps {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
  href?: string;
  icon?: React.ReactNode;
  subtitle?: string;
}

function BalanceChip({ label, value, tone, href, icon, subtitle }: BalanceChipProps) {
  const toneClasses: Record<typeof tone, string> = {
    neutral:
      "border-cream-edge/60 bg-paper/40 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
    success:
      "border-emerald-300/40 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50",
    warning:
      "border-amber-300/40 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  };

  const content = (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-colors ${toneClasses[tone]} ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider opacity-80">
          {icon}
          {label}
        </div>
        {href ? <ArrowUpRight className="h-3 w-3 opacity-60" /> : null}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(value)}</p>
      {subtitle ? <p className="mt-0.5 text-xs opacity-70">{subtitle}</p> : null}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function fmt(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
