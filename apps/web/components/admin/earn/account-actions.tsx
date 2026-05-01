"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  syncEarnAccount,
  syncAllEarnAccounts,
  updateEarnAccount,
} from "@/lib/api/earn";

export function SyncAccountButton({ accountId }: { accountId: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncEarnAccount(accountId);
      if (r.success) {
        setMsg(`✓ 同步成功 ($${r.total_usdt ?? "0"})`);
      } else {
        setMsg(`⚠ ${r.error}`);
      }
      router.refresh();
    } catch (e) {
      setMsg(`✗ ${(e as { code?: string }).code ?? "error"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={run} disabled={busy} size="sm" variant="outline">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        同步
      </Button>
      {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
    </div>
  );
}

export function SyncAllButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const results = await syncAllEarnAccounts();
      const ok = results.filter((r) => r.success).length;
      setMsg(`同步完成:${ok}/${results.length} 成功`);
      router.refresh();
    } catch (e) {
      setMsg(`✗ ${(e as { code?: string }).code ?? "error"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        同步所有帳戶
      </Button>
      {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
    </div>
  );
}

export function ArchiveAccountButton({
  accountId,
  archived,
}: {
  accountId: number;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    if (
      !confirm(archived ? "要恢復這個帳戶嗎?" : "要 archive 這個帳戶嗎?")
    ) {
      return;
    }
    setBusy(true);
    try {
      await updateEarnAccount(accountId, { archived: !archived });
      router.refresh();
    } catch (e) {
      alert(`失敗: ${(e as { code?: string }).code ?? "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={run} disabled={busy} size="sm" variant="outline">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : archived ? (
        <ArchiveRestore className="h-4 w-4" />
      ) : (
        <Archive className="h-4 w-4" />
      )}
      {archived ? "恢復" : "Archive"}
    </Button>
  );
}
