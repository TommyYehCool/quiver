"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock, Coins, TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyBalance, type Balance } from "@/lib/api/wallet";
import { fmtTwd, useUsdtTwdRate } from "@/lib/api/rates";
import { fetchEarnMe, type EarnMeOut } from "@/lib/api/earn-user";

const POLL_INTERVAL_MS = 5_000;

/**
 * 純餘額卡 — 顯示 Quiver 內可動用 + 在 Bitfinex Earn 賺利息中。
 */
export function BalanceCard() {
  const t = useTranslations("balance");
  const params = useParams();
  const locale = (params?.locale as string) ?? "zh-TW";
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

  const available = balance?.available ?? "0";
  const pending = balance?.pending ?? "0";
  const showPending = Number(pending) > 0;
  const earnLent = Number(earn?.lent_usdt ?? 0);
  const earnIdle = Number(earn?.funding_idle_usdt ?? 0);
  const earnTotal = earnLent + earnIdle;
  const showEarn = earn?.has_earn_account && earnTotal > 0;

  return (
    <Card className="bg-macaron-mint dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
          <Coins className="h-6 w-6 text-emerald-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("available")}
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {fmt(available)}{" "}
              <span className="text-sm font-normal text-slate-500">USDT</span>
            </p>
            {rate !== null ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ≈ {fmtTwd(available, rate)}{" "}
                <span className="text-[10px]">@ {rate.toFixed(2)}</span>
              </p>
            ) : null}
          </div>
          {showPending ? (
            <div>
              <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Clock className="h-3 w-3" /> {t("pending")}
              </p>
              <p className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                +{fmt(pending)}{" "}
                <span className="text-sm font-normal">USDT</span>
              </p>
            </div>
          ) : null}
          {showEarn ? (
            <Link
              href={`/${locale}/earn`}
              className="rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 hover:bg-emerald-100/60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
            >
              <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" /> 在 Bitfinex Earn 中
              </p>
              <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {fmt(String(earnTotal))}{" "}
                <span className="text-sm font-normal">USDT</span>
              </p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                {earnLent > 0 ? `已借出 ${fmt(String(earnLent))}` : ""}
                {earnLent > 0 && earnIdle > 0 ? " · " : ""}
                {earnIdle > 0 ? `等掛單 ${fmt(String(earnIdle))}` : ""}
              </p>
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function fmt(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
