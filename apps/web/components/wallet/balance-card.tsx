"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Coins,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchMyBalance,
  fetchMyHistory,
  type ActivityItem,
  type Balance,
} from "@/lib/api/wallet";
import { fmtTwd, useUsdtTwdRate } from "@/lib/api/rates";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;

export function BalanceCard() {
  const t = useTranslations("balance");
  const locale = useLocale();
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [history, setHistory] = React.useState<ActivityItem[]>([]);
  const { rate } = useUsdtTwdRate();

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let hasPending = false;
      try {
        const [b, h] = await Promise.all([
          fetchMyBalance(),
          fetchMyHistory({ pageSize: 5 }),
        ]);
        if (cancelled) return;
        setBalance(b);
        setHistory(h.items);
        hasPending =
          h.items.some((it) => it.status === "PROVISIONAL") || Number(b.pending) > 0;
      } catch {
        // 靜默失敗 — 下次 poll 再試
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
  const onchain = balance?.onchain ?? "0";
  const pending = balance?.pending ?? "0";
  const showPending = Number(pending) > 0;
  const onchainDiffers = balance && Number(onchain) !== Number(available);

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

        {/* on-chain reference (smaller, only show if it differs from ledger or always for clarity) */}
        <div className="flex items-center gap-2 rounded-lg border border-cream-edge bg-paper/50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          <Wallet className="h-3.5 w-3.5" />
          <span>{t("onchain")}</span>
          <span className="font-mono tabular-nums">{fmt(onchain)} USDT</span>
          {onchainDiffers ? (
            <span className="ml-auto text-[10px] italic">{t("onchainDifferNote")}</span>
          ) : null}
        </div>

        {history.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("history")}
              </p>
              <Link
                href={`/${locale}/wallet/history`}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                {t("viewAll")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {history.map((it) => (
                <HistoryRow key={it.id} it={it} t={t} />
              ))}
            </ul>
          </div>
        ) : null}
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
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
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
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
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
