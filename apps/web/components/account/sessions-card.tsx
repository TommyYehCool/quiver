"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, Monitor, ShieldOff, BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  fetchSessions,
  revokeOtherSessions,
  type LoginSessionItem,
} from "@/lib/api/account";

export function SessionsCard() {
  const t = useTranslations("settings.security");
  const confirm = useConfirm();
  const [items, setItems] = React.useState<LoginSessionItem[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await fetchSessions();
      setItems(r);
    } catch {
      setItems([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleRevokeOthers() {
    const ok = await confirm({
      title: t("revokeOthers"),
      body: t("confirmRevokeOthers"),
      variant: "danger",
      confirmLabel: t("revokeOthers"),
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await revokeOtherSessions();
      setMsg({ kind: "ok", text: t("revokedCount", { count: r.revoked }) });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as { code?: string }).code ?? "error" });
    } finally {
      setBusy(false);
    }
  }

  const activeCount = items?.filter((s) => !s.revoked_at).length ?? 0;
  const hasOthers = activeCount > 1;

  return (
    <Card className="bg-macaron-mint dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
          <Monitor className="h-6 w-6 text-emerald-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{t("sessionsTitle")}</CardTitle>
          <CardDescription>{t("sessionsDesc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items === null ? (
          <p className="text-sm text-slate-500">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {t("loading")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noSessions")}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
        )}
        {hasOthers ? (
          <div className="pt-2">
            <Button onClick={handleRevokeOthers} disabled={busy} variant="outline" size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              {t("revokeOthers")}
            </Button>
          </div>
        ) : null}
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

function SessionRow({ s }: { s: LoginSessionItem }) {
  const t = useTranslations("settings.security");
  const isActive = !s.revoked_at;
  return (
    <li
      className={
        isActive
          ? "rounded-lg border border-cream-edge bg-paper p-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          : "rounded-lg border border-cream-edge bg-paper/40 p-3 text-sm opacity-60 dark:border-slate-700 dark:bg-slate-800/40"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs">
            {s.is_current ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <BadgeCheck className="h-3 w-3" /> {t("current")}
              </span>
            ) : isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {t("active")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {t("revoked")}
              </span>
            )}
            <span className="font-mono text-xs text-slate-500">{s.ip ?? "—"}</span>
          </p>
          <p className="mt-1 truncate text-xs text-slate-500" title={s.user_agent ?? ""}>
            {s.user_agent ?? t("unknownDevice")}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t("lastSeen")}: {new Date(s.last_seen_at).toLocaleString("zh-TW")} · {t("loginAt")}:{" "}
            {new Date(s.created_at).toLocaleString("zh-TW")}
          </p>
        </div>
      </div>
    </li>
  );
}
