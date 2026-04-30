"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  lookupRecipient,
  submitTransfer,
  type RecipientPreview,
} from "@/lib/api/transfer";
import { fetchTwoFAStatus } from "@/lib/api/twofa";

type Stage = "form" | "confirm" | "submitting" | "success";

export function TransferCard() {
  const t = useTranslations("transfer");
  const router = useRouter();

  const [stage, setStage] = React.useState<Stage>("form");
  const [email, setEmail] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [recipient, setRecipient] = React.useState<RecipientPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successInfo, setSuccessInfo] = React.useState<{ amount: string; to: string } | null>(null);
  const [twofaEnabled, setTwofaEnabled] = React.useState(false);
  const [totpCode, setTotpCode] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void fetchTwoFAStatus()
      .then((s) => {
        if (!cancelled) setTwofaEnabled(s.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const amountValid = amount.trim().length > 0 && Number(amount) > 0;
  const emailValid = /\S+@\S+\.\S+/.test(email.trim());

  async function openConfirm() {
    if (!amountValid || !emailValid) return;
    setError(null);
    try {
      const r = await lookupRecipient(email.trim().toLowerCase());
      if (!r) {
        setError(t("errors.transfer.recipientNotFound"));
        return;
      }
      if (r.is_self) {
        setError(t("errors.transfer.selfTransfer"));
        return;
      }
      if (!r.kyc_approved) {
        setError(t("errors.transfer.recipientKycRequired"));
        return;
      }
      setRecipient(r);
      setStage("confirm");
    } catch (e) {
      setError((e as { code?: string }).code ?? "操作失敗");
    }
  }

  async function confirmSend() {
    if (!recipient) return;
    if (twofaEnabled) {
      const stripped = totpCode.replace(/[-\s]/g, "");
      if (stripped.length !== 6 && stripped.length !== 8) {
        setError(t.has("errors.transfer.twofaRequired") ? t("errors.transfer.twofaRequired") : "transfer.twofaRequired");
        return;
      }
    }
    setStage("submitting");
    setError(null);
    try {
      const r = await submitTransfer({
        recipient_email: recipient.email,
        amount,
        note: note.trim() || null,
        totp_code: twofaEnabled ? totpCode.trim() : undefined,
      });
      setSuccessInfo({ amount, to: r.recipient_email });
      setStage("success");
      // refresh balance card
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "transfer.commitFailed";
      setError(t.has(`errors.${code}`) ? t(`errors.${code}` as never) : code);
      setStage("confirm");
    }
  }

  function reset() {
    setEmail("");
    setAmount("");
    setNote("");
    setRecipient(null);
    setError(null);
    setSuccessInfo(null);
    setTotpCode("");
    setStage("form");
  }

  return (
    <Card className="bg-macaron-lavender dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-lavender">
          <Send className="h-6 w-6 text-violet-700" />
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
              <Label htmlFor="recipient">{t("recipientLabel")}</Label>
              <Input
                id="recipient"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
              />
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
                  min="0.000001"
                  step="0.01"
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  USDT
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">{t("noteLabel")}</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                rows={2}
                maxLength={200}
              />
            </div>
            {error ? <ErrorBox>{error}</ErrorBox> : null}
            <Button onClick={openConfirm} disabled={!amountValid || !emailValid}>
              {t("review")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {(stage === "confirm" || stage === "submitting") && recipient && (
          <ConfirmModal
            t={t}
            recipient={recipient}
            amount={amount}
            note={note.trim()}
            busy={stage === "submitting"}
            error={error}
            twofaEnabled={twofaEnabled}
            totpCode={totpCode}
            onTotpCodeChange={setTotpCode}
            onCancel={() => setStage("form")}
            onConfirm={confirmSend}
          />
        )}

        {stage === "success" && successInfo && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  {t("success.title")}
                </p>
                <p className="text-emerald-700/80 dark:text-emerald-300/80">
                  {t("success.message", { amount: successInfo.amount, to: successInfo.to })}
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
  recipient,
  amount,
  note,
  busy,
  error,
  twofaEnabled,
  totpCode,
  onTotpCodeChange,
  onCancel,
  onConfirm,
}: {
  t: ReturnType<typeof useTranslations>;
  recipient: RecipientPreview;
  amount: string;
  note: string;
  busy: boolean;
  error: string | null;
  twofaEnabled: boolean;
  totpCode: string;
  onTotpCodeChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{t("confirm.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("confirm.subtitle")}</p>

        <div className="mt-4 space-y-3 rounded-xl border border-cream-edge bg-macaron-lavender/40 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/40">
          <Row label={t("confirm.to")}>
            <div>
              <p className="font-medium">{recipient.display_name ?? recipient.email}</p>
              <p className="text-xs text-slate-500">{recipient.email}</p>
            </div>
          </Row>
          <Row label={t("confirm.amount")}>
            <p className="text-xl font-semibold tabular-nums">
              {amount}
              <span className="ml-1 text-xs font-normal text-slate-500">USDT</span>
            </p>
          </Row>
          {note ? (
            <Row label={t("confirm.note")}>
              <p className="text-sm">{note}</p>
            </Row>
          ) : null}
        </div>

        {twofaEnabled ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="transfer-totp">兩步驟驗證</Label>
            <Input
              id="transfer-totp"
              inputMode="numeric"
              value={totpCode}
              onChange={(e) => onTotpCodeChange(e.target.value)}
              placeholder="6 位驗證碼或 8 位備用碼"
              maxLength={20}
              className="font-mono tracking-widest"
              autoFocus
            />
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
