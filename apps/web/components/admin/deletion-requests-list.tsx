"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  completeDeletion,
  fetchDeletionRequests,
  type DeletionRequestRow,
} from "@/lib/api/account";

export function DeletionRequestsList() {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = React.useState<DeletionRequestRow[] | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems(await fetchDeletionRequests());
    } catch {
      setItems([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleComplete(userId: number) {
    const ok = await confirm({
      title: `完成 user #${userId} 的刪除?`,
      body: "會 soft delete:status SUSPENDED + email 改寫 + revoke 所有 sessions。\nledger 記錄保留(法遵需求)。",
      variant: "danger",
      confirmLabel: "完成刪除",
    });
    if (!ok) return;
    setBusyId(userId);
    setMsg(null);
    try {
      await completeDeletion(userId);
      setMsg({ kind: "ok", text: `user #${userId} 已完成刪除` });
      await load();
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "error";
      const params = (e as { params?: { balance?: string } }).params;
      const detail = code === "deletion.balanceNotZero"
        ? `${code}(餘額 ${params?.balance ?? "?"} 不為 0,要先請用戶清空)`
        : code;
      setMsg({ kind: "err", text: detail });
    } finally {
      setBusyId(null);
    }
  }

  if (items === null) {
    return (
      <p className="text-sm text-slate-500">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> 載入中
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-cream-edge bg-paper p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
        目前沒有任何刪除申請。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((row) => {
        const isPending = !row.completed_at;
        const balanceZero = Number(row.balance) === 0;
        return (
          <div
            key={row.user_id}
            className={
              isPending
                ? "rounded-lg border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-800"
                : "rounded-lg border border-cream-edge bg-paper/40 p-4 opacity-70 dark:border-slate-700 dark:bg-slate-800/40"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  #{row.user_id} · {row.email}
                  {row.display_name ? (
                    <span className="ml-2 text-xs text-slate-500">({row.display_name})</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  申請時間:{new Date(row.requested_at).toLocaleString("zh-TW")}
                </p>
                <p className="mt-1 text-xs">
                  餘額:
                  <span
                    className={
                      balanceZero
                        ? "ml-1 font-mono text-emerald-700 dark:text-emerald-400"
                        : "ml-1 font-mono text-rose-700 dark:text-rose-400"
                    }
                  >
                    {row.balance} USDT
                  </span>
                  {!balanceZero ? (
                    <span className="ml-2 text-rose-600 dark:text-rose-400">
                      ⚠ 餘額不為 0,不能完成刪除
                    </span>
                  ) : null}
                </p>
              </div>
              {isPending ? (
                <Button
                  onClick={() => handleComplete(row.user_id)}
                  disabled={!balanceZero || busyId === row.user_id}
                  variant="outline"
                  size="sm"
                >
                  {busyId === row.user_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  完成刪除
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已於 {new Date(row.completed_at!).toLocaleString("zh-TW")} 完成
                </span>
              )}
            </div>
          </div>
        );
      })}
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
    </div>
  );
}
