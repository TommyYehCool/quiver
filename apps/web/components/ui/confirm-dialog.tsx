"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

type Variant = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode; // 支援多行(whitespace-pre-line),也接 ReactNode
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = 紅色 confirm 按鈕 + 警示圖示 */
  variant?: Variant;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ctx = React.createContext<ConfirmContextValue | null>(null);

/**
 * imperative confirm — 用法跟原生 `confirm()` 一致(回 Promise<boolean>),
 * 但長相符合站上 design system。
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "刪除?", body: "不可逆", variant: "danger" });
 *   if (!ok) return;
 */
export function useConfirm() {
  const c = React.useContext(ctx);
  if (!c) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return c.confirm;
}

interface PendingRequest {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingRequest | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const handleClose = React.useCallback(
    (ok: boolean) => {
      setPending((current) => {
        if (current) current.resolve(ok);
        return null;
      });
    },
    [],
  );

  return (
    <ctx.Provider value={{ confirm }}>
      {children}
      {pending ? <ConfirmModal opts={pending.opts} onClose={handleClose} /> : null}
    </ctx.Provider>
  );
}

function ConfirmModal({
  opts,
  onClose,
}: {
  opts: ConfirmOptions;
  onClose: (ok: boolean) => void;
}) {
  const danger = opts.variant === "danger";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", onKey);
    // 防止背景滾動
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={() => onClose(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {danger ? (
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
              <AlertTriangle className="h-5 w-5 text-rose-700 dark:text-rose-300" />
            </span>
          ) : null}
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{opts.title}</h2>
            {opts.body ? (
              <div className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
                {opts.body}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onClose(false)}>
            {opts.cancelLabel ?? "取消"}
          </Button>
          <Button
            onClick={() => onClose(true)}
            autoFocus
            className={danger ? "bg-rose-600 text-white hover:bg-rose-700" : undefined}
          >
            {opts.confirmLabel ?? "確定"}
          </Button>
        </div>
      </div>
    </div>
  );
}
