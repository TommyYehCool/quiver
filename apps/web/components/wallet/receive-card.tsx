"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Check, Copy, Loader2, Wallet as WalletIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyWallet, type Wallet } from "@/lib/api/wallet";
import { ApiCallError } from "@/lib/api";

export function ReceiveCard() {
  const t = useTranslations("wallet");
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [error, setError] = React.useState<"notReady" | "other" | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await fetchMyWallet();
        if (!cancelled) setWallet(w);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiCallError && e.code === "wallet.systemNotReady") {
          setError("notReady");
        } else {
          setError("other");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopy() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error === "notReady") {
    return (
      <Card className="bg-macaron-rose dark:bg-slate-900">
        <CardHeader className="flex-row items-start gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
            <AlertTriangle className="h-6 w-6 text-rose-700" />
          </span>
          <div className="flex-1">
            <CardTitle>{t("notReady.title")}</CardTitle>
            <CardDescription>{t("notReady.desc")}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (error === "other" || (!wallet && !error)) {
    return (
      <Card className="bg-macaron-sky dark:bg-slate-900">
        <CardHeader className="flex-row items-start gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-sky">
            {error ? (
              <AlertTriangle className="h-6 w-6 text-rose-700" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
            )}
          </span>
          <div className="flex-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{error ? t("loadFailed") : t("loading")}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!wallet) return null;

  return (
    <Card className="bg-macaron-sky dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-sky">
          <WalletIcon className="h-6 w-6 text-sky-700" />
        </span>
        <div className="flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("title")}
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-slate-800 dark:text-sky-300">
              {wallet.token}
            </span>
            {wallet.network === "testnet" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {t("testnetBadge")}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <QRCodeSVG value={wallet.address} size={144} level="M" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("addressLabel")}</p>
              <p className="break-all rounded-lg border border-cream-edge bg-paper px-3 py-2 font-mono text-sm text-slate-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                {wallet.address}
              </p>
            </div>
            <Button onClick={handleCopy} variant="outline" size="sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("hint")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
