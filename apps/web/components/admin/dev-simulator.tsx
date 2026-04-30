"use client";

import * as React from "react";
import { Loader2, RefreshCw, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { syncTatumSubscriptions } from "@/lib/api/wallet";

type Msg = { kind: "ok" | "err"; text: string };

export function DevSimulator(_props: { userId: number }) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg | null>(null);

  async function handleSync() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncTatumSubscriptions();
      if (!r.callback_url) {
        setMsg({
          kind: "err",
          text: "找不到 ngrok URL — 請先確認 ngrok 已啟動或設定 WEBHOOK_CALLBACK_URL",
        });
      } else {
        setMsg({
          kind: "ok",
          text: `同步完成 → ${r.callback_url}\n建立: ${r.created} / 更新: ${r.refreshed} / 跳過: ${r.skipped} / 失敗: ${r.failed}`,
        });
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as { code?: string }).code ?? "操作失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-macaron-rose dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
          <Wrench className="h-6 w-6 text-rose-700" />
        </span>
        <div className="flex-1">
          <CardTitle>管理員工具</CardTitle>
          <CardDescription>系統維運</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            重新同步 Tatum 訂閱
          </p>
          <p className="text-xs text-slate-500">
            ngrok 重啟後 URL 會變,點這個重新訂閱所有用戶地址
          </p>
          <Button onClick={handleSync} disabled={busy} variant="outline">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            同步訂閱
          </Button>
          {msg ? (
            <p
              className={
                msg.kind === "ok"
                  ? "whitespace-pre-line rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "whitespace-pre-line rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
              }
            >
              {msg.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
