"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  disableTwoFA,
  enableTwoFA,
  fetchTwoFAStatus,
  startTwoFASetup,
  type TwoFASetup,
  type TwoFAStatus,
} from "@/lib/api/twofa";

type Locale = "zh-TW" | "en" | "ja";
const STRINGS: Record<Locale, {
  loading: string;
  title: string;
  desc: string;
  enabled: string;
  backupRemaining: (n: number) => string;
  disable: string;
  enable: string;
  setupHint: string;
  manualSecretLabel: string;
  codeRefreshNote: string;
  codePlaceholder: string;
  confirmEnable: string;
  cancel: string;
  backupWarning: string;
  backupNote: string;
  copyAll: string;
  doneSaved: string;
  disableConfirmTitle: string;
  disableConfirmBody: string;
  disableConfirmLabel: string;
  disablePrompt: string;
}> = {
  "zh-TW": {
    loading: "載入中",
    title: "兩步驟驗證(2FA)",
    desc: "開啟後,提領前必須輸入 Authenticator app 上的 6 位驗證碼。強烈建議啟用。",
    enabled: "已啟用",
    backupRemaining: (n) => `剩 ${n} 組備用碼`,
    disable: "關閉 2FA",
    enable: "啟用兩步驟驗證",
    setupHint: "用 Google Authenticator / 1Password / Authy 掃下面 QR,然後輸入 6 位驗證碼:",
    manualSecretLabel: "無法掃 QR 時,手動輸入 secret:",
    codeRefreshNote: "驗證碼每 30 秒更新一次。",
    codePlaceholder: "6 位驗證碼",
    confirmEnable: "確認啟用",
    cancel: "取消",
    backupWarning: "⚠ 請立刻把以下 8 組備用碼存好(密碼管理器 / 紙本)",
    backupNote: "每組只能用一次。手機掉了 / 重置時拿來救援。離開此頁就再也看不到了。",
    copyAll: "複製全部",
    doneSaved: "我已存好,完成",
    disableConfirmTitle: "關閉兩步驟驗證?",
    disableConfirmBody: "關閉後,提領 / 內轉 / 切換白名單模式都不會再要求驗證碼,降低帳戶安全性。",
    disableConfirmLabel: "繼續關閉",
    disablePrompt: "輸入 6 位驗證碼或備用碼以確認:",
  },
  en: {
    loading: "Loading",
    title: "Two-Factor Authentication (2FA)",
    desc: "Once enabled, you'll need a 6-digit code from your Authenticator app before withdrawals. Strongly recommended.",
    enabled: "Enabled",
    backupRemaining: (n) => `${n} backup codes remaining`,
    disable: "Disable 2FA",
    enable: "Enable 2FA",
    setupHint: "Scan the QR with Google Authenticator / 1Password / Authy, then enter the 6-digit code:",
    manualSecretLabel: "If you can't scan, enter secret manually:",
    codeRefreshNote: "Codes refresh every 30 seconds.",
    codePlaceholder: "6-digit code",
    confirmEnable: "Confirm & enable",
    cancel: "Cancel",
    backupWarning: "⚠ Save these 8 backup codes immediately (password manager / paper)",
    backupNote: "Each code works once. Use them if you lose / reset your phone. They will never be shown again after you leave this page.",
    copyAll: "Copy all",
    doneSaved: "I've saved them, done",
    disableConfirmTitle: "Disable Two-Factor Authentication?",
    disableConfirmBody: "After disabling, withdrawals / transfers / whitelist mode toggles will no longer require a code — your account becomes less secure.",
    disableConfirmLabel: "Continue disabling",
    disablePrompt: "Enter your 6-digit code or backup code to confirm:",
  },
  ja: {
    loading: "読み込み中",
    title: "二段階認証(2FA)",
    desc: "有効化後、出金時に Authenticator アプリの 6 桁コードが必要になります。強く推奨します。",
    enabled: "有効",
    backupRemaining: (n) => `バックアップコード残り ${n} 個`,
    disable: "2FA を無効化",
    enable: "二段階認証を有効化",
    setupHint: "Google Authenticator / 1Password / Authy で下の QR をスキャンし、6 桁コードを入力:",
    manualSecretLabel: "QR をスキャンできない場合、手動で secret を入力:",
    codeRefreshNote: "コードは 30 秒ごとに更新されます。",
    codePlaceholder: "6 桁コード",
    confirmEnable: "有効化を確定",
    cancel: "キャンセル",
    backupWarning: "⚠ 以下 8 個のバックアップコードを直ちに保存してください(パスワードマネージャー / 紙)",
    backupNote: "各コードは 1 回限り使用できます。スマホ紛失 / リセット時に救援用。このページを離れると二度と表示されません。",
    copyAll: "すべてコピー",
    doneSaved: "保存しました、完了",
    disableConfirmTitle: "二段階認証を無効化しますか?",
    disableConfirmBody: "無効化後、出金 / 内部送金 / ホワイトリストモード切替で認証コードが不要になり、アカウントのセキュリティが低下します。",
    disableConfirmLabel: "無効化を続行",
    disablePrompt: "6 桁コードまたはバックアップコードを入力して確認:",
  },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

type Mode = "loading" | "idle" | "setup" | "enabling" | "disabling" | "show-backup";

export function TwoFACard() {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const s = STRINGS[pickLocale(useLocale())];
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
    const ok = await confirmDialog({
      title: s.disableConfirmTitle,
      body: s.disableConfirmBody,
      variant: "danger",
      confirmLabel: s.disableConfirmLabel,
    });
    if (!ok) return;
    const c = prompt(s.disablePrompt);
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
          <Loader2 className="inline h-4 w-4 animate-spin" /> {s.loading}
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
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.desc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status idle */}
        {mode === "idle" && status ? (
          status.enabled ? (
            <>
              <p className="flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> {s.enabled} ·{" "}
                {status.enabled_at
                  ? new Date(status.enabled_at).toLocaleDateString()
                  : ""}{" "}
                · {s.backupRemaining(status.backup_codes_remaining)}
              </p>
              <Button onClick={handleDisable} disabled={busy} variant="outline" size="sm">
                <ShieldOff className="h-4 w-4" />
                {s.disable}
              </Button>
            </>
          ) : (
            <Button onClick={handleStartSetup} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {s.enable}
            </Button>
          )
        ) : null}

        {/* Setup mode: show QR + code input */}
        {mode === "setup" && setup ? (
          <>
            <p className="text-sm">{s.setupHint}</p>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-start">
              <div className="rounded-md bg-white p-2">
                <QRCodeSVG value={setup.provisioning_uri} size={160} />
              </div>
              <div className="flex-1 space-y-2 text-xs">
                <p className="text-slate-500">{s.manualSecretLabel}</p>
                <code className="block break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] dark:bg-slate-900">
                  {setup.secret}
                </code>
                <p className="text-slate-400">{s.codeRefreshNote}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder={s.codePlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-32 rounded-md border border-cream-edge bg-paper px-3 py-2 font-mono text-center tracking-widest dark:border-slate-700 dark:bg-slate-900"
              />
              <Button onClick={handleEnable} disabled={code.length !== 6 || busy} size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {s.confirmEnable}
              </Button>
              <Button onClick={() => setMode("idle")} variant="outline" size="sm">
                {s.cancel}
              </Button>
            </div>
          </>
        ) : null}

        {/* Show backup codes once */}
        {mode === "show-backup" && backupCodes ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{s.backupWarning}</p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{s.backupNote}</p>
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
                {s.copyAll}
              </Button>
              <Button onClick={handleDoneShowingBackup} size="sm">
                {s.doneSaved}
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
