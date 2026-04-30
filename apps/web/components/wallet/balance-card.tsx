"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Clock, Coins } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyBalance, type Balance } from "@/lib/api/wallet";
import { fmtTwd, useUsdtTwdRate } from "@/lib/api/rates";

const POLL_INTERVAL_MS = 5_000;

/**
 * 純餘額卡 — 只顯示可動用 + 處理中。最近活動歷史已拆到 RecentActivityCard。
 */
export function BalanceCard() {
  const t = useTranslations("balance");
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const { rate } = useUsdtTwdRate();

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let hasPending = false;
      try {
        const b = await fetchMyBalance();
        if (cancelled) return;
        setBalance(b);
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
