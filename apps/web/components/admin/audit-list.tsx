"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchAuditLogs, type AuditFilter, type AuditLogItem } from "@/lib/api/audit";

const PAGE_SIZE = 50;

export function AuditList() {
  const [items, setItems] = React.useState<AuditLogItem[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState<AuditFilter>({});
  const [pendingFilter, setPendingFilter] = React.useState<AuditFilter>({});

  const load = React.useCallback(
    async (p: number, f: AuditFilter) => {
      setItems(null);
      try {
        const r = await fetchAuditLogs({ ...f, page: p, page_size: PAGE_SIZE });
        setItems(r.items);
        setTotal(r.total);
      } catch {
        setItems([]);
        setTotal(0);
      }
    },
    [],
  );

  React.useEffect(() => {
    void load(page, filter);
  }, [page, filter, load]);

  function applyFilter() {
    setPage(1);
    setFilter(pendingFilter);
  }

  function clearFilter() {
    setPendingFilter({});
    setFilter({});
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            type="text"
            placeholder="Action (e.g. kyc.approve)"
            value={pendingFilter.action ?? ""}
            onChange={(e) => setPendingFilter({ ...pendingFilter, action: e.target.value || undefined })}
            className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            placeholder="Target kind (USER / KYC / WITHDRAWAL ...)"
            value={pendingFilter.target_kind ?? ""}
            onChange={(e) =>
              setPendingFilter({ ...pendingFilter, target_kind: e.target.value || undefined })
            }
            className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="number"
            placeholder="Target ID"
            value={pendingFilter.target_id ?? ""}
            onChange={(e) =>
              setPendingFilter({
                ...pendingFilter,
                target_id: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="number"
            placeholder="Actor ID"
            value={pendingFilter.actor_id ?? ""}
            onChange={(e) =>
              setPendingFilter({
                ...pendingFilter,
                actor_id: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={applyFilter} size="sm">
            <Search className="h-4 w-4" /> 套用篩選
          </Button>
          <Button onClick={clearFilter} variant="outline" size="sm">
            清除
          </Button>
          <span className="ml-auto text-xs text-slate-500">共 {total} 筆</span>
        </div>
      </div>

      {/* List */}
      {items === null ? (
        <p className="text-sm text-slate-500">
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> 載入中
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-cream-edge bg-paper p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          無紀錄。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <AuditRow key={it.id} it={it} />
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            variant="outline"
            size="sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            variant="outline"
            size="sm"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditRow({ it }: { it: AuditLogItem }) {
  const [open, setOpen] = React.useState(false);
  const hasPayload = it.payload && Object.keys(it.payload).length > 0;
  return (
    <li className="rounded-lg border border-cream-edge bg-paper p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span
              className={
                it.actor_kind === "ADMIN"
                  ? "inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                  : it.actor_kind === "USER"
                    ? "inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              }
            >
              {it.actor_kind}
            </span>
            <span className="font-mono text-xs">{it.action}</span>
            {it.target_kind ? (
              <span className="text-xs text-slate-500">
                → {it.target_kind}
                {it.target_id !== null ? `#${it.target_id}` : ""}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {it.actor_email ?? (it.actor_id ? `#${it.actor_id}` : "system")}
            {it.ip ? ` · ${it.ip}` : ""}
            {" · "}
            {new Date(it.created_at).toLocaleString("zh-TW")}
          </p>
        </div>
        {hasPayload ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            {open ? "▼ payload" : "▶ payload"}
          </button>
        ) : null}
      </div>
      {open && hasPayload ? (
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-900">
          {JSON.stringify(it.payload, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}
