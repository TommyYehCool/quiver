"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { acceptTos, fetchTosStatus, type TosStatus } from "@/lib/api/tos";

/**
 * TosGate — 全站 modal,沒同意過 TOS 的用戶會被擋住,直到勾選同意。
 *
 * 既有用戶在 migration backfill 時 tos_version 設為 "pre-tos",
 * needs_acceptance 一樣會是 true(current_version 已經換成新版),所以也會看到一次 modal。
 */
export function TosGate({ locale }: { locale: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<TosStatus | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void fetchTosStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === null || !status.needs_acceptance) return null;

  async function handleAccept() {
    if (!agreed || !status) return;
    setBusy(true);
    setErr(null);
    try {
      await acceptTos(status.current_version);
      setStatus({ ...status, needs_acceptance: false });
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-w-lg rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-semibold">服務條款 / 隱私政策更新</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          使用本服務前,請仔細閱讀並同意我們的{" "}
          <Link
            href={`/${locale}/legal/terms`}
            target="_blank"
            className="text-brand underline"
          >
            服務條款
          </Link>{" "}
          與{" "}
          <Link
            href={`/${locale}/legal/privacy`}
            target="_blank"
            className="text-brand underline"
          >
            隱私政策
          </Link>
          。
        </p>
        <p className="mt-2 text-xs text-slate-500">版本: {status.current_version}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>我已閱讀並同意上述服務條款與隱私政策。</span>
        </label>
        {err ? (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {err}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={handleAccept} disabled={!agreed || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            同意並繼續
          </Button>
        </div>
      </div>
    </div>
  );
}
