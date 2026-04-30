"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quoteWithdrawal, submitWithdrawal, type WithdrawalQuote } from "@/lib/api/withdrawal";

type Stage = "form" | "confirm" | "submitting" | "success";

export function WithdrawCard() {
  const t = useTranslations("withdraw");
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("form");
  const [address, setAddress] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState<WithdrawalQuote | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ status: string; needsReview: boolean } | null>(null);

  // Tron 地址 Base58Check:T + 33 base58 字元(排除 0OIl)。Case-sensitive。
  const addressValid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
  const amountValid = amount.trim().length > 0 && Number(amount) > 0;

  async function openConfirm() {
    if (!addressValid || !amountValid) return;
    setError(null);
    try {
      const q = await quoteWithdrawal(amount);
      setQuote(q);
      setStage("confirm");
    } catch (e) {
      setError(translateError(e, t));
    }
  }

  async function confirmSend() {
    setStage("submitting");
    setError(null);
    try {
      const r = await submitWithdrawal({ to_address: address.trim(), amount });
      setSuccess({ status: r.status, needsReview: r.needs_admin_review });
      setStage("success");
      router.refresh();
    } catch (e) {
      setError(translateError(e, t));
      setStage("confirm");
    }
  }

  function reset() {
    setAddress("");
    setAmount("");
    setQuote(null);
    setError(null);
    setSuccess(null);
    setStage("form");
  }

  return (
    <Card className="bg-macaron-rose dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
          <ArrowUpRight className="h-6 w-6 text-rose-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {stage === "form" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="to-address">{t("addressLabel")}</Label>
              <Input
                id="to-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="T..."
                className="font-mono"
              />
              {address.trim() && !addressValid ? (
                <p className="text-xs text-rose-600">{t("errors.withdrawal.invalidAddress")}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t("amountLabel")}</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="5"
                  step="0.01"
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  USDT
                </span>
              </div>
              <p className="text-xs text-slate-500">{t("feeNote")}</p>
            </div>
            {error ? <ErrorBox>{error}</ErrorBox> : null}
            <Button onClick={openConfirm} disabled={!addressValid || !amountValid}>
              {t("review")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {(stage === "confirm" || stage === "submitting") && quote && (
          <ConfirmModal
            t={t}
            address={address}
            quote={quote}
            busy={stage === "submitting"}
            error={error}
            onCancel={() => setStage("form")}
            onConfirm={confirmSend}
          />
        )}

        {stage === "success" && success && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1 text-sm text-emerald-700 dark:text-emerald-300">
                <p className="font-medium">{t("success.title")}</p>
                <p className="mt-0.5">
                  {success.needsReview ? t("success.needsReview") : t("success.approved")}
                </p>
              </div>
            </div>
            <Button onClick={reset} variant="outline">
              {t("success.again")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmModal({
  t,
  address,
  quote,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  t: ReturnType<typeof useTranslations>;
  address: string;
  quote: WithdrawalQuote;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{t("confirm.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("confirm.subtitle")}</p>

        <div className="mt-4 space-y-3 rounded-xl border border-cream-edge bg-macaron-rose/40 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/40">
          <Row label={t("confirm.to")}>
            <p className="break-all font-mono text-xs">{address}</p>
          </Row>
          <Row label={t("confirm.amount")}>
            <p className="font-semibold tabular-nums">
              {quote.amount} <span className="text-xs font-normal text-slate-500">USDT</span>
            </p>
          </Row>
          <Row label={t("confirm.fee")}>
            <p className="text-rose-600 tabular-nums dark:text-rose-400">
              -{quote.fee} <span className="text-xs font-normal">USDT</span>
            </p>
          </Row>
          <div className="border-t border-cream-edge pt-2 dark:border-slate-700">
            <Row label={t("confirm.total")}>
              <p className="text-lg font-semibold tabular-nums">
                {quote.total} <span className="text-xs font-normal text-slate-500">USDT</span>
              </p>
            </Row>
          </div>
        </div>

        {quote.needs_admin_review ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <p>{t("confirm.largeNotice")}</p>
          </div>
        ) : null}

        {error ? <div className="mt-3"><ErrorBox>{error}</ErrorBox></div> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("confirm.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("confirm.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex-none text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {children}
    </p>
  );
}

function translateError(e: unknown, t: ReturnType<typeof useTranslations>): string {
  const code = (e as { code?: string }).code ?? "withdrawal.commitFailed";
  const path = `errors.${code}`;
  return t.has(path) ? t(path as never) : code;
}
