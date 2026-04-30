"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disableTwoFA,
  enableTwoFA,
  fetchTwoFAStatus,
  startTwoFASetup,
  type TwoFASetup,
  type TwoFAStatus,
} from "@/lib/api/twofa";

type Mode = "loading" | "idle" | "setup" | "enabling" | "disabling" | "show-backup";

export function TwoFACard() {
  const router = useRouter();
  const [status, setStatus] = React.useState<TwoFAStatus | null>(null);
  const [setup, setSetup] = React.useState<TwoFASetup | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("loading");
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const s = await fetchTwoFAStatus();
      setStatus(s);
      setMode("idle");
    } catch {
      setStatus(null);
      setMode("idle");
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function handleStartSetup() {
    setBusy(true);
    setErr(null);
    try {
      const s = await startTwoFASetup();
      setSetup(s);
      setCode("");
      setMode("setup");
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable() {
    if (code.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await enableTwoFA(code);
      setBackupCodes(r.backup_codes);
      setMode("show-backup");
      setSetup(null);
      setCode("");
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!confirm("確定關閉兩步驟驗證?")) return;
    const c = prompt("輸入 6 位驗證碼或備用碼以確認:");
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      await disableTwoFA(c);
      setBackupCodes(null);
      await reload();
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  function handleDoneShowingBackup() {
    setBackupCodes(null);
    void reload();
  }

  if (mode === "loading") {
    return (
      <Card className="bg-macaron-lavender dark:bg-slate-900">
        <CardContent className="pt-6">
          <Loader2 className="inline h-4 w-4 animate-spin" /> 載入中
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-macaron-lavender dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-lavender">
          <ShieldCheck className="h-6 w-6 text-violet-700" />
        </span>
        <div className="flex-1">
          <CardTitle>兩步驟驗證(2FA)</CardTitle>
          <CardDescription>
            開啟後,提領前必須輸入 Authenticator app 上的 6 位驗證碼。強烈建議啟用。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status idle */}
        {mode === "idle" && status ? (
          status.enabled ? (
            <>
              <p className="flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> 已啟用 ·{" "}
                {status.enabled_at
                  ? new Date(status.enabled_at).toLocaleDateString("zh-TW")
                  : ""}{" "}
                · 剩 {status.backup_codes_remaining} 組備用碼
              </p>
              <Button onClick={handleDisable} disabled={busy} variant="outline" size="sm">
                <ShieldOff className="h-4 w-4" />
                關閉 2FA
              </Button>
            </>
          ) : (
            <Button onClick={handleStartSetup} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              啟用兩步驟驗證
            </Button>
          )
        ) : null}

        {/* Setup mode: show QR + code input */}
        {mode === "setup" && setup ? (
          <>
            <p className="text-sm">
              用 Google Authenticator / 1Password / Authy 掃下面 QR,然後輸入 6 位驗證碼:
            </p>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-start">
              <div className="rounded-md bg-white p-2">
                <QRCodeSVG value={setup.provisioning_uri} size={160} />
              </div>
              <div className="flex-1 space-y-2 text-xs">
                <p className="text-slate-500">無法掃 QR 時,手動輸入 secret:</p>
                <code className="block break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] dark:bg-slate-900">
                  {setup.secret}
                </code>
                <p className="text-slate-400">驗證碼每 30 秒更新一次。</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位驗證碼"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-32 rounded-md border border-cream-edge bg-paper px-3 py-2 font-mono text-center tracking-widest dark:border-slate-700 dark:bg-slate-900"
              />
              <Button onClick={handleEnable} disabled={code.length !== 6 || busy} size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                確認啟用
              </Button>
              <Button onClick={() => setMode("idle")} variant="outline" size="sm">
                取消
              </Button>
            </div>
          </>
        ) : null}

        {/* Show backup codes once */}
        {mode === "show-backup" && backupCodes ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              ⚠ 請立刻把以下 8 組備用碼存好(密碼管理器 / 紙本)
            </p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              每組只能用一次。手機掉了 / 重置時拿來救援。**離開此頁就再也看不到了**。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {backupCodes.map((c) => (
                <code
                  key={c}
                  className="rounded bg-white px-2 py-1 text-center font-mono text-sm dark:bg-slate-900"
                >
                  {c}
                </code>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join("\n"));
                }}
                variant="outline"
                size="sm"
              >
                複製全部
              </Button>
              <Button onClick={handleDoneShowingBackup} size="sm">
                我已存好,完成
              </Button>
            </div>
          </div>
        ) : null}

        {err ? (
          <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {err}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
