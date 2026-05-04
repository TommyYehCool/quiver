"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyHistory, type ActivityItem } from "@/lib/api/wallet";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;

/**
 * 最近活動卡 — 顯示最新 5 筆 deposit / transfer / withdrawal。
 * 從 BalanceCard 拆出來,讓 dashboard 可以把它放在錢包操作之後。
 */
export function RecentActivityCard() {
  const t = useTranslations("balance");
  const locale = useLocale();
  const [history, setHistory] = React.useState<ActivityItem[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let hasPending = false;
      try {
        const h = await fetchMyHistory({ pageSize: 5 });
        if (cancelled) return;
        setHistory(h.items);
        hasPending = h.items.some((it) => it.status === "PROVISIONAL");
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

  return (
    <Card className="bg-macaron-sky dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-sky">
          <Activity className="h-6 w-6 text-sky-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{t("history")}</CardTitle>
          <CardDescription>
            {t("historyDesc")}
          </CardDescription>
        </div>
        <Link
          href={`/${locale}/wallet/history`}
          className="flex items-center gap-1 text-xs text-brand hover:underline"
        >
          {t("viewAll")} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {history === null ? (
          <p className="text-sm text-slate-500">{t("loading")}</p>
        ) : history.length === 0 ? (
          <p className="rounded-md border border-cream-edge bg-paper px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            {t("noActivity")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((it) => (
              <HistoryRow key={it.id} it={it} t={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  it,
  t,
}: {
  it: ActivityItem;
  t: ReturnType<typeof useTranslations>;
}) {
  const isPending = it.status === "PROVISIONAL";
  const isOut = it.type === "TRANSFER_OUT" || it.type === "WITHDRAWAL";
  const isTransferIn = it.type === "TRANSFER_IN";
  const sign = isOut ? "-" : "+";
  const amountColor = isOut
    ? "text-rose-600 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400";
  const Icon = isOut ? ArrowUpRight : ArrowDownLeft;
  const typeLabel =
    it.type === "DEPOSIT"
      ? t("typeDeposit")
      : it.type === "TRANSFER_IN"
        ? t("typeTransferIn")
        : it.type === "TRANSFER_OUT"
          ? t("typeTransferOut")
          : it.type === "WITHDRAWAL"
            ? t("typeWithdrawal")
            : t("typeRefund");

  const counterparty =
    isTransferIn || it.type === "TRANSFER_OUT"
      ? it.counterparty_display_name ?? it.counterparty_email
      : null;

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              isPending
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                : isOut
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
            )}
          >
            <Icon className="h-3 w-3" />
            {typeLabel}{isPending ? ` · ${t("statusPending")}` : ""}
          </span>
          <span className="text-slate-500">{new Date(it.created_at).toLocaleString("zh-TW")}</span>
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {counterparty ? counterparty : it.tx_hash ? <span className="font-mono">{it.tx_hash}</span> : null}
          {it.note ? <span className="ml-2 italic">「{it.note}」</span> : null}
        </p>
      </div>
      <p className={cn("flex-none font-semibold tabular-nums", amountColor)}>
        {sign}
        {fmt(it.amount)}
      </p>
    </li>
  );
}

function fmt(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
