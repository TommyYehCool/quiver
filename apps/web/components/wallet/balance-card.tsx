"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Clock, Coins, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyBalance, fetchMyHistory, type Balance, type OnchainTx } from "@/lib/api/wallet";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;

export function BalanceCard() {
  const t = useTranslations("balance");
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [history, setHistory] = React.useState<OnchainTx[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let hasPending = false;
      try {
        const [b, h] = await Promise.all([fetchMyBalance(), fetchMyHistory(10)]);
        if (cancelled) return;
        setBalance(b);
        setHistory(h);
        hasPending =
          h.some((tx) => tx.status === "PROVISIONAL") || Number(b.pending) > 0;
      } catch {
        // 靜默失敗 — 下次 poll 再試
      }
      if (cancelled) return;
      // 處理中時 5s 一輪;閒置時 30s 一輪,降低 server 壓力
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
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("available")}
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {fmt(available)}{" "}
              <span className="text-sm font-normal text-slate-500">USDT</span>
            </p>
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

        {history.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("history")}
            </p>
            <ul className="space-y-2">
              {history.slice(0, 5).map((tx) => (
                <HistoryRow key={tx.id} tx={tx} t={t} />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  tx,
  t,
}: {
  tx: OnchainTx;
  t: ReturnType<typeof useTranslations>;
}) {
  const isPending = tx.status === "PROVISIONAL";
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              isPending
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="-mt-0.5 mr-1 inline h-3 w-3 animate-spin" />
                {t("statusPending")}
              </>
            ) : (
              t("statusPosted")
            )}
          </span>
          <span className="text-slate-500">
            {new Date(tx.created_at).toLocaleString("zh-TW")}
          </span>
        </p>
        <p className="truncate font-mono text-[10px] text-slate-400">{tx.tx_hash}</p>
      </div>
      <p className="flex-none font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
        +{fmt(tx.amount)}
      </p>
    </li>
  );
}

function fmt(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

