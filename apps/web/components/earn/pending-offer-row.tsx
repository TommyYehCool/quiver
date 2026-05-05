"use client";

/**
 * PendingOfferRow — interactive row for a single pending Bitfinex funding
 * offer. Displays amount + rate + period and provides Cancel + Edit actions.
 *
 * F-5a-3.9 (commit 3-4/4 of the pending-offer-card series). Cancel sends
 * one API call. Edit opens an inline modal where the user picks new
 * amount/rate/period and the client does cancel-then-submit (no atomic
 * "amend" exists in the Bitfinex API, so we sequence client-side).
 *
 * Auto-lend caveat is shown explicitly in the modal — auto-lend cron
 * (~every 1-2 min) may cancel + re-post the manual offer if the user
 * doesn't toggle off auto-lend in /earn/bot-settings. Mentioned once in
 * the modal so the user isn't surprised.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Coins, Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cancelPendingOffer, submitCustomOffer, type PendingOfferOut } from "@/lib/api/earn-user";

type Locale = "zh-TW" | "en" | "ja";

interface RowStrings {
  rateFrr: string;
  rateFixed: string;
  periodDays: (n: number) => string;
  cancelBtn: string;
  editBtn: string;
  cancelConfirmTitle: string;
  cancelConfirmBody: string;
  cancelFailed: string;
  modalTitle: string;
  modalAmount: string;
  modalAmountHint: string;
  modalRate: string;
  modalRateFrr: string;
  modalRateCustom: string;
  modalRateHint: string;
  modalPeriod: string;
  modalPeriodHint: string;
  modalSubmit: string;
  modalCancel: string;
  modalAutoLendWarning: string;
  modalSubmitting: string;
  modalErrorPrefix: string;
}

const STRINGS: Record<Locale, RowStrings> = {
  "zh-TW": {
    rateFrr: "FRR 市場單",
    rateFixed: "固定利率",
    periodDays: (n) => `${n} 天`,
    cancelBtn: "取消",
    editBtn: "調整",
    cancelConfirmTitle: "取消這筆 offer?",
    cancelConfirmBody:
      "本金會立刻回到 funding wallet 變成「等待掛單」。auto-lend 開啟時,下次 cron(約 1-2 分鐘)可能會自動重新掛單 — 想避免請先到放貸機器人設定關閉 auto-lend。",
    cancelFailed: "取消失敗",
    modalTitle: "調整 offer 參數",
    modalAmount: "金額 (USDT)",
    modalAmountHint: "最少 50 USDT (Bitfinex 限制)",
    modalRate: "利率",
    modalRateFrr: "FRR 市場單(跟著 FRR 浮動)",
    modalRateCustom: "自訂日利率 (%)",
    modalRateHint: "例如 0.025 = 0.025%/天 ≈ 9.13% APR",
    modalPeriod: "期間 (天)",
    modalPeriodHint: "Bitfinex 範圍 2-30 天",
    modalSubmit: "確認重新掛單",
    modalCancel: "取消",
    modalAutoLendWarning:
      "⚠ auto-lend 開啟時,下次 cron 可能用預設策略覆寫你的設定。如要保留請先關閉 auto-lend。",
    modalSubmitting: "處理中...",
    modalErrorPrefix: "失敗:",
  },
  en: {
    rateFrr: "FRR market order",
    rateFixed: "Fixed rate",
    periodDays: (n) => `${n} days`,
    cancelBtn: "Cancel",
    editBtn: "Edit",
    cancelConfirmTitle: "Cancel this offer?",
    cancelConfirmBody:
      "Funds return to funding wallet immediately. With auto-lend ON, the next cron (~1-2 min) may re-post automatically — toggle off auto-lend in bot-settings first to keep funds idle.",
    cancelFailed: "Cancel failed",
    modalTitle: "Adjust offer parameters",
    modalAmount: "Amount (USDT)",
    modalAmountHint: "Min 50 USDT (Bitfinex limit)",
    modalRate: "Rate",
    modalRateFrr: "FRR market order (tracks FRR)",
    modalRateCustom: "Custom daily rate (%)",
    modalRateHint: "e.g. 0.025 = 0.025%/day ≈ 9.13% APR",
    modalPeriod: "Period (days)",
    modalPeriodHint: "Bitfinex range 2-30 days",
    modalSubmit: "Confirm re-post",
    modalCancel: "Cancel",
    modalAutoLendWarning:
      "⚠ With auto-lend ON, the next cron may overwrite your manual offer. Toggle off auto-lend first to keep it.",
    modalSubmitting: "Processing...",
    modalErrorPrefix: "Failed: ",
  },
  ja: {
    rateFrr: "FRR マーケット注文",
    rateFixed: "固定利率",
    periodDays: (n) => `${n} 日`,
    cancelBtn: "キャンセル",
    editBtn: "調整",
    cancelConfirmTitle: "この offer をキャンセル?",
    cancelConfirmBody:
      "資金はすぐに funding wallet に戻ります。auto-lend がオンの場合、次の cron(約 1-2 分)が自動で再掲する可能性があります — 維持したい場合は先に bot-settings で auto-lend をオフにしてください。",
    cancelFailed: "キャンセル失敗",
    modalTitle: "offer パラメータの調整",
    modalAmount: "金額 (USDT)",
    modalAmountHint: "最小 50 USDT (Bitfinex 制限)",
    modalRate: "利率",
    modalRateFrr: "FRR マーケット注文(FRR に追従)",
    modalRateCustom: "カスタム日利率 (%)",
    modalRateHint: "例: 0.025 = 0.025%/日 ≈ 9.13% APR",
    modalPeriod: "期間 (日)",
    modalPeriodHint: "Bitfinex 範囲 2-30 日",
    modalSubmit: "再掲を確認",
    modalCancel: "キャンセル",
    modalAutoLendWarning:
      "⚠ auto-lend がオンだと、次の cron が手動 offer を上書きする可能性があります。維持したい場合は先に auto-lend をオフにしてください。",
    modalSubmitting: "処理中...",
    modalErrorPrefix: "失敗: ",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  const abs = Math.abs(n);
  let min: number, max: number;
  if (abs === 0) { min = 2; max = 2; }
  else if (abs < 0.01) { min = 2; max = 8; }
  else if (abs < 1) { min = 2; max = 4; }
  else { min = 2; max = 2; }
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max })}`;
}

export function PendingOfferRow({ offer }: { offer: PendingOfferOut }) {
  const router = useRouter();
  const confirm = useConfirm();
  const s = STRINGS[pickLocale(useLocale())];

  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const rateLabel = offer.is_frr
    ? s.rateFrr
    : `${s.rateFixed} ${(Number(offer.rate_daily) * 100).toFixed(4)}%/d`;

  async function handleCancel() {
    const ok = await confirm({
      title: s.cancelConfirmTitle,
      body: s.cancelConfirmBody,
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelPendingOffer(offer.id);
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? s.cancelFailed;
      alert(`${s.cancelFailed}: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="font-mono">{fmtUsd(offer.amount)}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {rateLabel}
          </span>
          <span className="text-xs text-slate-500">{s.periodDays(offer.period_days)}</span>
          <span className="text-xs text-slate-400">offer #{offer.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {s.editBtn}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={handleCancel}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
            {s.cancelBtn}
          </Button>
        </div>
      </div>

      {editing && (
        <EditOfferModal
          offer={offer}
          strings={s}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditOfferModal({
  offer,
  strings,
  onClose,
  onSuccess,
}: {
  offer: PendingOfferOut;
  strings: RowStrings;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = React.useState(offer.amount);
  const [rateMode, setRateMode] = React.useState<"frr" | "custom">(
    offer.is_frr ? "frr" : "custom",
  );
  // For UX, store rate as a percentage string (0.025 for 0.025%/d) instead
  // of the raw daily rate decimal (0.00025) — easier to type.
  const [rateInputPct, setRateInputPct] = React.useState(
    offer.is_frr ? "" : (Number(offer.rate_daily) * 100).toFixed(4),
  );
  const [periodDays, setPeriodDays] = React.useState(offer.period_days);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      // Step 1: cancel the existing offer
      await cancelPendingOffer(offer.id);
      // Step 2: tiny delay so Bitfinex releases the funds before our submit
      // (otherwise submit fails with insufficient available balance).
      await new Promise((r) => setTimeout(r, 1500));
      // Step 3: submit the new offer with user's params
      const rateDaily =
        rateMode === "frr" ? null : (Number(rateInputPct) / 100).toString();
      await submitCustomOffer({
        amount,
        rate_daily: rateDaily,
        period_days: periodDays,
      });
      onSuccess();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "unknown error";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-cream-edge bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold">{strings.modalTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div>
            <Label htmlFor="amount">{strings.modalAmount}</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">{strings.modalAmountHint}</p>
          </div>

          {/* Rate mode selector */}
          <div>
            <Label>{strings.modalRate}</Label>
            <div className="mt-1 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={rateMode === "frr"}
                  onChange={() => setRateMode("frr")}
                  disabled={submitting}
                />
                {strings.modalRateFrr}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={rateMode === "custom"}
                  onChange={() => setRateMode("custom")}
                  disabled={submitting}
                />
                {strings.modalRateCustom}
              </label>
              {rateMode === "custom" && (
                <div className="ml-6">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={rateInputPct}
                    onChange={(e) => setRateInputPct(e.target.value)}
                    disabled={submitting}
                    placeholder="0.025"
                    className="font-mono"
                  />
                  <p className="mt-1 text-xs text-slate-500">{strings.modalRateHint}</p>
                </div>
              )}
            </div>
          </div>

          {/* Period */}
          <div>
            <Label htmlFor="period">{strings.modalPeriod}</Label>
            <Input
              id="period"
              type="number"
              min={2}
              max={30}
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              disabled={submitting}
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">{strings.modalPeriodHint}</p>
          </div>

          {/* Auto-lend warning */}
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            {strings.modalAutoLendWarning}
          </div>

          {/* Error display */}
          {err && (
            <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {strings.modalErrorPrefix}{err}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              {strings.modalCancel}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {strings.modalSubmitting}
                </>
              ) : (
                strings.modalSubmit
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
