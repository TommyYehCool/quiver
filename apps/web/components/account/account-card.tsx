"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Loader2, Trash2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  cancelDeletion,
  downloadMyData,
  getDeletionRequest,
  requestDeletion,
  type DeletionRequestStatus,
} from "@/lib/api/account";

export function AccountCard() {
  const t = useTranslations("settings.account");
  const router = useRouter();
  const confirm = useConfirm();
  const [status, setStatus] = React.useState<DeletionRequestStatus | null>(null);
  const [busyExport, setBusyExport] = React.useState(false);
  const [busyDel, setBusyDel] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      setStatus(await getDeletionRequest());
    } catch {
      setStatus({ requested_at: null, completed_at: null });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    setBusyExport(true);
    setMsg(null);
    try {
      await downloadMyData();
      setMsg({ kind: "ok", text: t("exportOk") });
    } catch {
      setMsg({ kind: "err", text: t("exportFailed") });
    } finally {
      setBusyExport(false);
    }
  }

  async function handleRequestDelete() {
    const ok = await confirm({
      title: t("requestDelete"),
      body: t("confirmDelete"),
      variant: "danger",
      confirmLabel: t("requestDelete"),
    });
    if (!ok) return;
    setBusyDel(true);
    setMsg(null);
    try {
      const s = await requestDeletion();
      setStatus(s);
      setMsg({ kind: "ok", text: t("deleteRequested") });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as { code?: string }).code ?? "error" });
    } finally {
      setBusyDel(false);
    }
  }

  async function handleCancelDelete() {
    setBusyDel(true);
    setMsg(null);
    try {
      const s = await cancelDeletion();
      setStatus(s);
      setMsg({ kind: "ok", text: t("deleteCancelled") });
    } catch (e) {
      setMsg({ kind: "err", text: (e as { code?: string }).code ?? "error" });
    } finally {
      setBusyDel(false);
    }
  }

  const isPendingDeletion = status?.requested_at && !status?.completed_at;

  return (
    <Card className="bg-macaron-cream dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-cream">
          <UserMinus className="h-6 w-6 text-amber-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 個資匯出 */}
        <div className="rounded-lg border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-medium">{t("exportTitle")}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("exportDesc")}</p>
          <div className="mt-3">
            <Button onClick={handleExport} disabled={busyExport} variant="outline" size="sm">
              {busyExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("exportButton")}
            </Button>
          </div>
        </div>

        {/* 刪除帳號 */}
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900 dark:bg-rose-950/20">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            {t("deleteTitle")}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("deleteDesc")}</p>
          {isPendingDeletion ? (
            <div className="mt-3 space-y-2">
              <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {t("pendingNotice", {
                  date: new Date(status!.requested_at!).toLocaleString("zh-TW"),
                })}
              </p>
              <Button
                onClick={handleCancelDelete}
                disabled={busyDel}
                variant="outline"
                size="sm"
              >
                {busyDel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("cancelDelete")}
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                onClick={handleRequestDelete}
                disabled={busyDel}
                variant="outline"
                size="sm"
                className="border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300"
              >
                {busyDel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("requestDelete")}
              </Button>
            </div>
          )}
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
