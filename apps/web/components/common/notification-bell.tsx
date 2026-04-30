"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllRead,
  markRead,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api/notifications";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Poll unread count
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const u = await fetchUnreadCount();
        if (!cancelled) setUnread(u);
      } catch {
        // 靜默
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Click-away
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      const r = await fetchNotifications(15, 0);
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      // 靜默
    } finally {
      setLoading(false);
    }
  }

  async function handleItemClick(it: NotificationItem) {
    if (!it.read_at) {
      try {
        const u = await markRead(it.id);
        setUnread(u);
        setItems((prev) =>
          prev.map((x) =>
            x.id === it.id ? { ...x, read_at: new Date().toISOString() } : x,
          ),
        );
      } catch {
        // 忽略
      }
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead();
      setUnread(0);
      setItems((prev) =>
        prev.map((x) =>
          x.read_at ? x : { ...x, read_at: new Date().toISOString() },
        ),
      );
    } catch {
      // 忽略
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        aria-label={t("ariaLabel")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cream-edge bg-paper text-slate-ink transition-colors hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[360px] origin-top-right rounded-2xl border border-cream-edge bg-paper shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-cream-edge px-4 py-3 dark:border-slate-700">
            <p className="text-sm font-semibold">{t("title")}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Check className="h-3 w-3" /> {t("markAllRead")}
              </button>
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{t("empty")}</p>
            ) : (
              <ul>
                {items.map((it) => (
                  <NotificationRow
                    key={it.id}
                    it={it}
                    t={t}
                    onClick={() => handleItemClick(it)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  it,
  t,
  onClick,
}: {
  it: NotificationItem;
  t: ReturnType<typeof useTranslations>;
  onClick: () => void;
}) {
  const isUnread = !it.read_at;
  const icon = iconFor(it.type);
  const tone = toneFor(it.type);
  const message = renderMessage(it, t);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 border-b border-cream-edge/60 px-4 py-3 text-left transition-colors hover:bg-cream/40 dark:border-slate-800 dark:hover:bg-slate-800/40",
          isUnread && "bg-cream/30 dark:bg-slate-800/30",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 flex-none items-center justify-center rounded-full",
            tone,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{message}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {new Date(it.created_at).toLocaleString("zh-TW")}
          </p>
        </div>
        {isUnread ? (
          <span className="mt-1 inline-block h-2 w-2 flex-none rounded-full bg-brand" aria-hidden />
        ) : null}
      </button>
    </li>
  );
}

function iconFor(type: NotificationType): React.ReactNode {
  switch (type) {
    case "DEPOSIT_POSTED":
      return <ArrowDownToLine className="h-4 w-4 text-emerald-700" />;
    case "TRANSFER_RECEIVED":
      return <Send className="h-4 w-4 text-violet-700" />;
    case "KYC_APPROVED":
      return <ShieldCheck className="h-4 w-4 text-emerald-700" />;
    case "KYC_REJECTED":
      return <XCircle className="h-4 w-4 text-rose-700" />;
    case "WITHDRAWAL_COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
    case "WITHDRAWAL_FAILED":
    case "WITHDRAWAL_REJECTED":
      return <XCircle className="h-4 w-4 text-rose-700" />;
    default:
      return <ArrowUpRight className="h-4 w-4 text-slate-500" />;
  }
}

function toneFor(type: NotificationType): string {
  switch (type) {
    case "DEPOSIT_POSTED":
    case "WITHDRAWAL_COMPLETED":
    case "KYC_APPROVED":
      return "bg-bubble-mint";
    case "TRANSFER_RECEIVED":
      return "bg-bubble-lavender";
    case "KYC_REJECTED":
    case "WITHDRAWAL_FAILED":
    case "WITHDRAWAL_REJECTED":
      return "bg-bubble-rose";
    default:
      return "bg-bubble-sky";
  }
}

function renderMessage(
  it: NotificationItem,
  t: ReturnType<typeof useTranslations>,
): string {
  const p = it.params ?? {};
  const key = `messages.${it.type}`;
  // 各 type 用對應 i18n template,fallback 到 raw type 名
  if (t.has(key)) {
    return t(key as never, p as never);
  }
  return it.type;
}
