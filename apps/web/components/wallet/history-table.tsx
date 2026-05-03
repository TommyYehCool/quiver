"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { ArrowDownLeft, ArrowDownToLine, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Locale = "zh-TW" | "en" | "ja";
const HEADERS: Record<Locale, { type: string; counterparty: string; note: string; time: string; amount: string }> = {
  "zh-TW": { type: "類型", counterparty: "對方 / Tx", note: "備註", time: "時間", amount: "金額" },
  en: { type: "Type", counterparty: "Counterparty / Tx", note: "Note", time: "Time", amount: "Amount" },
  ja: { type: "種類", counterparty: "相手 / Tx", note: "メモ", time: "時刻", amount: "金額" },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export interface HistoryItem {
  id: string;
  type: "DEPOSIT" | "TRANSFER_IN" | "TRANSFER_OUT" | "WITHDRAWAL" | "REFUND";
  amount: string;
  currency: string;
  status: string;
  note: string | null;
  counterparty_email: string | null;
  counterparty_display_name: string | null;
  tx_hash: string | null;
  created_at: string;
}

interface Labels {
  typeDeposit: string;
  typeTransferIn: string;
  typeTransferOut: string;
  typeWithdrawal: string;
  typeRefund: string;
  statusPending: string;
  statusPosted: string;
  empty: string;
}

export function HistoryTable({ items, t }: { items: HistoryItem[]; t: Labels }) {
  const h = HEADERS[pickLocale(useLocale())];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-edge text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
            <th className="py-2 pr-4">{h.type}</th>
            <th className="py-2 pr-4">{h.counterparty}</th>
            <th className="py-2 pr-4">{h.note}</th>
            <th className="py-2 pr-4">{h.time}</th>
            <th className="py-2 pr-4 text-right">{h.amount}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <Row key={it.id} it={it} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ it, t }: { it: HistoryItem; t: Labels }) {
  const isPending = it.status === "PROVISIONAL";
  const isOut = it.type === "TRANSFER_OUT" || it.type === "WITHDRAWAL";
  const sign = isOut ? "-" : "+";
  const amountColor = isOut
    ? "text-rose-600 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400";
  const Icon =
    it.type === "DEPOSIT" || it.type === "REFUND"
      ? ArrowDownToLine
      : isOut
        ? ArrowUpRight
        : ArrowDownLeft;
  const typeLabel =
    it.type === "DEPOSIT"
      ? t.typeDeposit
      : it.type === "TRANSFER_IN"
        ? t.typeTransferIn
        : it.type === "TRANSFER_OUT"
          ? t.typeTransferOut
          : it.type === "WITHDRAWAL"
            ? t.typeWithdrawal
            : t.typeRefund;

  const counterparty =
    it.type === "TRANSFER_IN" || it.type === "TRANSFER_OUT"
      ? it.counterparty_display_name ?? it.counterparty_email ?? "—"
      : null;

  return (
    <tr className="border-b border-cream-edge/60 transition-colors hover:bg-cream/30 dark:border-slate-800 dark:hover:bg-slate-800/40">
      <td className="py-3 pr-4">
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
          {typeLabel}
          {isPending ? ` · ${t.statusPending}` : ""}
        </span>
      </td>
      <td className="max-w-[260px] truncate py-3 pr-4">
        {counterparty ?? (it.tx_hash ? <span className="font-mono text-xs">{it.tx_hash}</span> : "—")}
      </td>
      <td className="max-w-[180px] truncate py-3 pr-4 text-xs italic text-slate-500">
        {it.note ?? ""}
      </td>
      <td className="py-3 pr-4 text-xs text-slate-500">
        {new Date(it.created_at).toLocaleString("zh-TW")}
      </td>
      <td className={cn("py-3 pr-4 text-right font-semibold tabular-nums", amountColor)}>
        {sign}
        {fmt(it.amount)}
      </td>
    </tr>
  );
}

function fmt(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
