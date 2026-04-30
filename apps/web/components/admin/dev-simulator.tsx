"use client";

import * as React from "react";
import { FlaskConical, Loader2, RefreshCw, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { devSimulateDeposit, syncTatumSubscriptions } from "@/lib/api/wallet";

type Msg = { kind: "ok" | "err"; text: string };

export function DevSimulator({ userId }: { userId: number }) {
  const [amount, setAmount] = React.useState("100");
  const [simBusy, setSimBusy] = React.useState(false);
  const [simMsg, setSimMsg] = React.useState<Msg | null>(null);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState<Msg | null>(null);

  async function handleSimulate() {
    if (!amount || Number(amount) <= 0) return;
    setSimBusy(true);
    setSimMsg(null);
    try {
      const tx = await devSimulateDeposit(userId, amount);
      setSimMsg({
        kind: "ok",
        text: `模擬成功 — onchain_tx #${tx.id} 直接升 POSTED + ledger 寫入完成`,
      });
    } catch (e) {
      setSimMsg({ kind: "err", text: (e as { code?: string }).code ?? "操作失敗" });
    } finally {
      setSimBusy(false);
    }
  }

  async function handleSync() {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await syncTatumSubscriptions();
      if (!r.callback_url) {
        setSyncMsg({
          kind: "err",
          text: "找不到 ngrok URL — 請先確認 ngrok 已啟動或設定 WEBHOOK_CALLBACK_URL",
        });
      } else {
        setSyncMsg({
          kind: "ok",
          text: `同步完成 → ${r.callback_url}\n建立: ${r.created} / 更新: ${r.refreshed} / 跳過: ${r.skipped} / 失敗: ${r.failed}`,
        });
      }
    } catch (e) {
      setSyncMsg({ kind: "err", text: (e as { code?: string }).code ?? "操作失敗" });
    } finally {
      setSyncBusy(false);
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
          <CardDescription>系統維運 + dev 測試</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* sync tatum — 任何環境都可用 */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            重新同步 Tatum 訂閱
          </p>
          <p className="text-xs text-slate-500">
            ngrok 重啟後 URL 會變,點這個重新訂閱所有用戶地址
          </p>
          <Button onClick={handleSync} disabled={syncBusy} variant="outline">
            {syncBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            同步訂閱
          </Button>
          {syncMsg ? <ResultBox msg={syncMsg} /> : null}
        </div>

        <div className="border-t border-cream-edge dark:border-slate-700" />

        {/* simulate deposit — testnet only */}
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            模擬入金
            <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              TESTNET ONLY
            </span>
          </p>
          <p className="text-xs text-slate-500">
            假裝 Tatum 通知收到 USDT,直接走 ledger flow 確認餘額/UI 顯示正確
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="max-w-[160px]"
              min="0.000001"
              step="0.01"
            />
            <Button onClick={handleSimulate} disabled={simBusy} variant="outline">
              {simBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              模擬入金
            </Button>
          </div>
          {simMsg ? <ResultBox msg={simMsg} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultBox({ msg }: { msg: Msg }) {
  return (
    <p
      className={
        msg.kind === "ok"
          ? "whitespace-pre-line rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "whitespace-pre-line rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }
    >
      {msg.text}
    </p>
  );
}
