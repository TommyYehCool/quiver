"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bulkSweep } from "@/lib/api/withdrawal";

export function BulkSweepButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function handleClick() {
    if (
      !confirm(
        "確認一次性 sweep 所有 user?\n\n" +
          "每個 user 會排一個 sweep 任務,USDT ≥ 10 才會真的搬。\n" +
          "搬完 user 鏈上 USDT ≈ 0,集中到 HOT wallet。",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await bulkSweep();
      setMsg({
        kind: "ok",
        text: `已派發 ${r.dispatched} 個 sweep 任務 (user_ids=${r.user_ids.join(",")})。\n` +
          `每個任務需 ~15 秒(TRX top-up + USDT 上鏈),完成後刷新看 HOT 餘額。`,
      });
      // 30 秒後 refresh,讓任務有時間完成
      setTimeout(() => router.refresh(), 30_000);
    } catch (e) {
      setMsg({ kind: "err", text: (e as { code?: string }).code ?? "操作失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={busy} variant="outline" size="sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        Bulk sweep
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
  );
}
