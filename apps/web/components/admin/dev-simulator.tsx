"use client";

import * as React from "react";
import { FlaskConical, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { devSimulateDeposit } from "@/lib/api/wallet";

export function DevSimulator({ userId }: { userId: number }) {
  const [amount, setAmount] = React.useState("100");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function handleSimulate() {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const tx = await devSimulateDeposit(userId, amount);
      setMsg({
        kind: "ok",
        text: `模擬成功 — onchain_tx #${tx.id} 已建立 (PROVISIONAL),10 秒後會升 POSTED`,
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: (e as { code?: string }).code ?? "操作失敗",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-macaron-rose dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
          <FlaskConical className="h-6 w-6 text-rose-700" />
        </span>
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2">
            DEV 工具 — 模擬入金
            <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              TESTNET ONLY
            </span>
          </CardTitle>
          <CardDescription>
            假裝 Tatum 通知收到 USDT,跑一次 PROVISIONAL → 10 秒後 POSTED 流程
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <Button onClick={handleSimulate} disabled={busy} variant="outline">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            模擬入金
          </Button>
        </div>
        {msg ? (
          <p
            className={
              msg.kind === "ok"
                ? "rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            }
          >
            {msg.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
