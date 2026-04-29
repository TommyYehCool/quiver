"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Key,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateKek, verifyKek, type SetupStatus } from "@/lib/api/setup";

type Step = "intro" | "show-kek" | "saved" | "verify" | "done";

export function SetupWizard({
  locale: _locale,
  initialStatus,
}: {
  locale: string;
  initialStatus: SetupStatus | null;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(
    initialStatus?.awaiting_verify ? "verify" : "intro",
  );
  const [kekB64, setKekB64] = React.useState<string | null>(null);
  const [kekPreview, setKekPreview] = React.useState<string | null>(null);
  const [savedAck, setSavedAck] = React.useState(false);
  const [verifyInput, setVerifyInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const r = await generateKek();
      setKekB64(r.kek_b64);
      setKekPreview(r.kek_hash_preview);
      setStep("show-kek");
    } catch (e) {
      setError((e as { code?: string }).code ?? "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      await verifyKek(verifyInput.trim());
      setStep("done");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "verify_failed";
      const map: Record<string, string> = {
        "setup.kekMismatch": "KEK 不正確,請確認複製是否完整",
        "setup.invalidKekFormat": "格式錯誤(必須是 base64 編碼的 32 byte)",
        "setup.notAwaitingVerify": "目前狀態不是等待驗證,請重新整理頁面",
      };
      setError(map[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!kekB64) return;
    await navigator.clipboard.writeText(kekB64);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">系統初始化</h1>
        <p className="mt-1 text-sm text-slate-500">
          設定主加密金鑰 (KEK)。這個流程**只需要做一次**。
        </p>
      </div>

      <Stepper step={step} />

      {step === "intro" && (
        <Card className="bg-macaron-peach dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-peach">
              <Key className="h-6 w-6 text-amber-700" />
            </span>
            <div className="flex-1">
              <CardTitle>產生主加密金鑰</CardTitle>
              <CardDescription>
                系統會產生一把 32 byte 隨機 KEK,只顯示一次。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Warning>
              KEK 一旦遺失,所有用 KEK 加密的資料(包括用戶錢包私鑰)都無法解密。
              請務必妥善保存 — 建議用密碼管理器 + 紙本各一份。
            </Warning>
            <Button onClick={handleGenerate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              產生 KEK
            </Button>
            {error ? <ErrorBox>{error}</ErrorBox> : null}
          </CardContent>
        </Card>
      )}

      {step === "show-kek" && kekB64 && (
        <Card className="bg-macaron-lavender dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-lavender">
              <Lock className="h-6 w-6 text-violet-700" />
            </span>
            <div className="flex-1">
              <CardTitle>請保存這把 KEK</CardTitle>
              <CardDescription>離開或重新整理後就再也看不到。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="break-all rounded-xl border border-cream-edge bg-paper p-4 font-mono text-sm">
              {kekB64}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4" /> {copied ? "已複製" : "複製"}
              </Button>
              <span className="text-xs text-slate-500">
                Hash 前 8 碼:<span className="font-mono">{kekPreview}</span>
              </span>
            </div>
            <Warning>
              請馬上把 KEK 存到密碼管理器,並另外抄寫一份紙本到安全的地方。
            </Warning>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={savedAck}
                onChange={(e) => setSavedAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>我已將 KEK 安全保存(密碼管理器 / 紙本至少其一)</span>
            </label>
            <Button onClick={() => setStep("verify")} disabled={!savedAck}>
              下一步:驗證
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "verify" && (
        <Card className="bg-macaron-mint dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
              <ShieldAlert className="h-6 w-6 text-emerald-700" />
            </span>
            <div className="flex-1">
              <CardTitle>抽問驗證</CardTitle>
              <CardDescription>把剛剛保存的 KEK 貼回來,確認你能取得。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder="貼上完整的 KEK base64 (44 字元)"
              className="font-mono"
            />
            <Button onClick={handleVerify} disabled={busy || verifyInput.trim().length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              驗證並完成初始化
            </Button>
            {error ? <ErrorBox>{error}</ErrorBox> : null}
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card className="bg-macaron-mint dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
              <CheckCircle2 className="h-6 w-6 text-emerald-700" />
            </span>
            <div className="flex-1">
              <CardTitle>初始化完成 ✓</CardTitle>
              <CardDescription>master seed 已加密寫入 DB。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>還有最後 2 步,請在你的終端機執行:</p>
            <ol className="space-y-3">
              <li>
                <p className="mb-1 font-medium">1. 把 KEK 寫進 .env</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
{`# 編輯 /Users/.../quiver/.env
KEK_CURRENT_B64=<剛剛複製的 KEK>`}
                </pre>
              </li>
              <li>
                <p className="mb-1 font-medium">2. 重建 api 跟 worker(必須 up -d 才會讀新的 .env,restart 不會)</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
{`docker compose up -d api worker`}
                </pre>
              </li>
            </ol>
            <p className="text-xs text-slate-500">
              重啟後 api 會驗證 env 與 DB hash 一致,若失敗會拒絕啟動 — 那代表 KEK 寫錯了,
              請對照保存的 KEK 重新填。
            </p>
            <Button onClick={() => router.refresh()}>已完成,重新檢查</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "intro", label: "說明" },
    { id: "show-kek", label: "顯示 KEK" },
    { id: "verify", label: "驗證" },
    { id: "done", label: "完成" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={
                done
                  ? "flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white"
                  : active
                    ? "flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-gradient text-xs font-medium text-white"
                    : "flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span className={active ? "text-xs font-medium" : "hidden text-xs text-slate-500 sm:inline"}>
              {s.label}
            </span>
            {i < steps.length - 1 ? <div className="h-px flex-1 bg-cream-edge dark:bg-slate-800" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
      <p>{children}</p>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
      {children}
    </p>
  );
}
