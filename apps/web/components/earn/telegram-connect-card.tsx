"use client";

/**
 * F-5a-4.1 — Telegram bot connect card on /earn/bot-settings.
 *
 * Three states:
 *   1. Bot NOT configured server-side (no env vars yet)
 *      → shows greyed "coming soon" — no buttons clickable
 *   2. Bot configured, user NOT bound
 *      → "Connect Telegram" button → fetches bind code → opens deep link
 *        in new tab → polls /status every 3s for confirmation
 *   3. Bot configured, user bound
 *      → green check + "@username" + "Disconnect" button
 *
 * Polling stops automatically when bound (or after 5 min timeout) so we
 * don't burn API calls forever.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  Unlink,
} from "lucide-react";

import {
  disconnectTelegram,
  fetchTelegramStatus,
  generateTelegramBindCode,
  type TelegramBindCodeOut,
} from "@/lib/api/telegram";
import { updateEarnSettings } from "@/lib/api/earn-user";
import { cn } from "@/lib/utils";

type Locale = "zh-TW" | "en" | "ja";

interface Strings {
  comingSoonTitle: string;
  comingSoonBody: string;
  connectTitle: string;
  connectBody: string;
  connectCta: string;
  generating: string;
  codeReady: string;
  codeBody: (botUsername: string) => string;
  openTelegram: string;
  waiting: string;
  bindCodeLabel: string;
  expiresIn: (mins: number) => string;
  expired: string;
  regenerate: string;
  boundTitle: string;
  boundBody: string;
  boundUsername: (u: string) => string;
  boundNoUsername: string;
  disconnectCta: string;
  disconnecting: string;
  errorPrefix: string;
  // F-5a-4.3
  leaderboardLabel: string;
  leaderboardOnHint: (handle: string) => string;
  leaderboardOffHint: string;
  leaderboardSaving: string;
  leaderboardLink: string;
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    comingSoonTitle: "Telegram 通知 — 即將推出",
    comingSoonBody:
      "Quiver 的 Telegram bot 還在設定中。上線後你能收到「借出成功」「Spike 抓到」「自動續借」等即時通知。",
    connectTitle: "連接 Telegram 收即時通知",
    connectBody:
      "綁定後,Quiver 會在以下事件即時推訊息給你:借出成功、Spike 抓到(高利率)、利息結算、auto-lend 因故暫停。隨時可解綁,Quiver 不會主動傳訊息。",
    connectCta: "連接 Telegram",
    generating: "產生綁定碼中...",
    codeReady: "✨ 綁定碼已產生",
    codeBody: (u) => `點下方按鈕在 Telegram 開啟 @${u},按 Start 即完成綁定。`,
    openTelegram: "在 Telegram 開啟",
    waiting: "等待 Telegram 確認中... (這頁會自動更新)",
    bindCodeLabel: "綁定碼",
    expiresIn: (mins) => `${mins} 分鐘後過期`,
    expired: "已過期 — 請重新產生",
    regenerate: "重新產生",
    boundTitle: "✅ 已連接 Telegram",
    boundBody: "Quiver 部位事件會即時推到你 Telegram。",
    boundUsername: (u) => `@${u}`,
    boundNoUsername: "(沒有 username)",
    disconnectCta: "解除綁定",
    disconnecting: "解除中...",
    errorPrefix: "失敗:",
    leaderboardLabel: "在 /rank 公開排行榜顯示我的 username",
    leaderboardOnHint: (h) => `會顯示為 ${h}(其他人在 /rank 上看得到)`,
    leaderboardOffHint: "目前匿名顯示為 hash(只有你自己認得)",
    leaderboardSaving: "儲存中...",
    leaderboardLink: "→ 看排行榜",
  },
  en: {
    comingSoonTitle: "Telegram notifications — coming soon",
    comingSoonBody:
      "Quiver's Telegram bot is still being set up. Once live you'll get realtime alerts for lent events, spike captures, and auto-renews.",
    connectTitle: "Connect Telegram for realtime alerts",
    connectBody:
      "Once bound, Quiver will push you a message on each event: lent success, spike captured (high APR), interest settled, auto-lend paused. Disconnect anytime — Quiver never DMs unprompted.",
    connectCta: "Connect Telegram",
    generating: "Generating bind code...",
    codeReady: "✨ Bind code ready",
    codeBody: (u) =>
      `Tap the button below to open @${u} in Telegram and press Start to complete binding.`,
    openTelegram: "Open in Telegram",
    waiting: "Waiting for Telegram confirmation... (this page auto-updates)",
    bindCodeLabel: "Bind code",
    expiresIn: (mins) => `Expires in ${mins} min`,
    expired: "Expired — please regenerate",
    regenerate: "Regenerate",
    boundTitle: "✅ Telegram connected",
    boundBody: "Position events will be pushed to your Telegram in realtime.",
    boundUsername: (u) => `@${u}`,
    boundNoUsername: "(no username)",
    disconnectCta: "Disconnect",
    disconnecting: "Disconnecting...",
    errorPrefix: "Failed: ",
    leaderboardLabel: "Show my username on the public /rank leaderboard",
    leaderboardOnHint: (h) => `Will appear as ${h} (visible to anyone on /rank)`,
    leaderboardOffHint: "Currently anonymized as a hash (only you can recognize)",
    leaderboardSaving: "Saving...",
    leaderboardLink: "→ View leaderboard",
  },
  ja: {
    comingSoonTitle: "Telegram 通知 — 近日公開",
    comingSoonBody:
      "Quiver の Telegram bot はまだセットアップ中です。公開後、貸出成功、スパイク捕獲、自動更新などのリアルタイム通知を受け取れます。",
    connectTitle: "Telegram に接続してリアルタイム通知",
    connectBody:
      "接続後、Quiver は次のイベントでメッセージを送ります:貸出成功、スパイク捕獲(高 APR)、利息結算、auto-lend 一時停止。いつでも解除可能 — Quiver は勝手に DM しません。",
    connectCta: "Telegram に接続",
    generating: "バインドコード生成中...",
    codeReady: "✨ バインドコードが準備できました",
    codeBody: (u) =>
      `下のボタンで Telegram の @${u} を開き、Start を押してバインド完了。`,
    openTelegram: "Telegram で開く",
    waiting: "Telegram の確認待ち...(このページは自動更新)",
    bindCodeLabel: "バインドコード",
    expiresIn: (mins) => `${mins} 分後に失効`,
    expired: "失効 — 再生成してください",
    regenerate: "再生成",
    boundTitle: "✅ Telegram 接続済み",
    boundBody: "ポジションイベントが Telegram にリアルタイムで通知されます。",
    boundUsername: (u) => `@${u}`,
    boundNoUsername: "(username なし)",
    disconnectCta: "接続解除",
    disconnecting: "解除中...",
    errorPrefix: "失敗:",
    leaderboardLabel: "/rank 公開リーダーボードで username を表示",
    leaderboardOnHint: (h) => `${h} として表示されます (/rank で誰でも閲覧可能)`,
    leaderboardOffHint: "現在は匿名ハッシュとして表示(あなただけが識別可能)",
    leaderboardSaving: "保存中...",
    leaderboardLink: "→ リーダーボードを見る",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

interface Props {
  initialBound: boolean;
  initialBotUsername: string | null;
  initialUsername?: string | null;
  /** F-5a-4.3: leaderboard opt-in initial state. */
  initialShowOnLeaderboard?: boolean;
  /** Locale for the "→ View leaderboard" link href. */
  locale: string;
}

export function TelegramConnectCard({
  initialBound,
  initialBotUsername,
  initialUsername,
  initialShowOnLeaderboard = false,
  locale,
}: Props) {
  const router = useRouter();
  const s = STRINGS[pickLocale(useLocale())];

  const [bound, setBound] = React.useState(initialBound);
  const [boundUsername, setBoundUsername] = React.useState<string | null>(
    initialUsername ?? null,
  );
  const [code, setCode] = React.useState<TelegramBindCodeOut | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // ─── State 1: bot not configured server-side ───
  if (!initialBotUsername) {
    return (
      <div className="rounded-xl border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-900/30">
        <div className="flex items-start gap-3">
          <Send className="h-5 w-5 flex-none text-slate-400" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {s.comingSoonTitle}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {s.comingSoonBody}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── State 3: already bound ───
  if (bound) {
    return (
      <BoundView
        s={s}
        locale={locale}
        boundUsername={boundUsername}
        initialShowOnLeaderboard={initialShowOnLeaderboard}
        onDisconnected={() => {
          setBound(false);
          setBoundUsername(null);
          router.refresh();
        }}
      />
    );
  }

  // ─── State 2: bot configured, user not yet bound ───
  return <ConnectFlow s={s} onBound={(username) => {
    setBound(true);
    setBoundUsername(username);
    router.refresh();
  }} initialBotUsername={initialBotUsername}
    code={code} setCode={setCode}
    busy={busy} setBusy={setBusy}
    err={err} setErr={setErr}
  />;
}

function ConnectFlow({
  s,
  onBound,
  initialBotUsername,
  code,
  setCode,
  busy,
  setBusy,
  err,
  setErr,
}: {
  s: Strings;
  onBound: (username: string | null) => void;
  initialBotUsername: string;
  code: TelegramBindCodeOut | null;
  setCode: (c: TelegramBindCodeOut | null) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  err: string | null;
  setErr: (e: string | null) => void;
}) {
  // Tick once per minute for the "expires in N min" countdown re-render.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [code]);

  // Poll /api/telegram/status every 3s once we have an active code, until
  // we see bound=true OR the code expires OR 5 min cap.
  React.useEffect(() => {
    if (!code) return;
    const startedAt = Date.now();
    const POLL_INTERVAL = 3000;
    const POLL_TIMEOUT = 5 * 60 * 1000; // 5 min

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const status = await fetchTelegramStatus();
        if (cancelled) return;
        if (status.bound) {
          onBound(status.username);
          return; // stop polling
        }
      } catch {
        // ignore transient fetch errors; next tick will retry
      }
      if (Date.now() - startedAt > POLL_TIMEOUT) {
        return; // give up silently — user can regenerate
      }
      setTimeout(poll, POLL_INTERVAL);
    };
    setTimeout(poll, POLL_INTERVAL);
    return () => {
      cancelled = true;
    };
  }, [code, onBound]);

  async function handleGenerate() {
    setBusy(true);
    setErr(null);
    try {
      const result = await generateTelegramBindCode();
      setCode(result);
      // Auto-open Telegram in new tab for desktop convenience.
      window.open(result.deep_link, "_blank", "noopener");
    } catch (e) {
      setErr((e as { code?: string }).code ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  // Compute "expires in N min" / "expired"
  let countdownLabel: string | null = null;
  let isExpired = false;
  if (code) {
    const msLeft = new Date(code.expires_at).getTime() - Date.now();
    isExpired = msLeft <= 0;
    if (!isExpired) {
      countdownLabel = s.expiresIn(Math.ceil(msLeft / 60_000));
    }
  }

  return (
    <div className="rounded-xl border border-sky-300/60 bg-sky-50/40 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
      <div className="flex items-start gap-3">
        <Send className="h-5 w-5 flex-none text-sky-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-sky-800 dark:text-sky-200">
            {s.connectTitle}
          </div>
          <p className="mt-0.5 text-xs text-sky-700/90 dark:text-sky-300/90">
            {s.connectBody}
          </p>

          {!code ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {busy ? s.generating : s.connectCta}
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-md border border-sky-200/60 bg-white/60 p-3 dark:border-sky-900/40 dark:bg-slate-900/40">
              <div className="text-xs font-medium text-sky-800 dark:text-sky-200">
                {s.codeReady}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {s.codeBody(code.bot_username)}
              </p>
              <div className="flex items-center justify-between gap-3 rounded border border-sky-200/40 bg-sky-50/40 px-2 py-1.5 dark:border-sky-900/40 dark:bg-sky-950/40">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {s.bindCodeLabel}
                  </div>
                  <div className="font-mono text-sm font-bold tracking-widest text-slate-700 dark:text-slate-300">
                    {code.bind_code}
                  </div>
                </div>
                <div
                  className={cn(
                    "text-[11px]",
                    isExpired ? "text-red-500" : "text-slate-500",
                  )}
                >
                  {isExpired ? s.expired : countdownLabel}
                </div>
              </div>
              {!isExpired ? (
                <a
                  href={code.deep_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  {s.openTelegram} @{code.bot_username}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {s.regenerate}
                </button>
              )}
              {!isExpired ? (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {s.waiting}
                </div>
              ) : null}
            </div>
          )}

          {err ? (
            <div className="mt-2 text-xs text-red-500">
              {s.errorPrefix}
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * F-5a-4.3 — Bound state of TelegramConnectCard. Carved out as a separate
 * component because it has its own state (leaderboard opt-in toggle, busy,
 * err) that's only relevant when bound. Cleaner than nesting hooks
 * conditionally in the parent.
 */
function BoundView({
  s,
  locale,
  boundUsername,
  initialShowOnLeaderboard,
  onDisconnected,
}: {
  s: Strings;
  locale: string;
  boundUsername: string | null;
  initialShowOnLeaderboard: boolean;
  onDisconnected: () => void;
}) {
  const [showLeaderboard, setShowLeaderboard] = React.useState(
    initialShowOnLeaderboard,
  );
  const [busy, setBusy] = React.useState(false);
  const [savingLeaderboard, setSavingLeaderboard] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleDisconnect() {
    setBusy(true);
    setErr(null);
    try {
      await disconnectTelegram();
      onDisconnected();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLeaderboard() {
    if (savingLeaderboard) return;
    const next = !showLeaderboard;
    setSavingLeaderboard(true);
    setErr(null);
    try {
      const r = await updateEarnSettings({ show_on_leaderboard: next });
      setShowLeaderboard(r.show_on_leaderboard);
    } catch (e) {
      setErr((e as { code?: string }).code ?? "failed");
    } finally {
      setSavingLeaderboard(false);
    }
  }

  // Pre-compute hint text for the leaderboard toggle
  const handleDisplay = boundUsername ? `@${boundUsername}` : "(no @username)";
  const hint = showLeaderboard
    ? s.leaderboardOnHint(handleDisplay)
    : s.leaderboardOffHint;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-300/60 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      {/* Top: bound status + disconnect button */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 flex-none text-emerald-600" />
          <div>
            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {s.boundTitle}
            </div>
            <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">
              {s.boundBody}
            </p>
            <div className="mt-1 text-xs font-mono text-slate-600 dark:text-slate-400">
              {boundUsername
                ? s.boundUsername(boundUsername)
                : s.boundNoUsername}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Unlink className="h-3.5 w-3.5" />
          )}
          {busy ? s.disconnecting : s.disconnectCta}
        </button>
      </div>

      {/* F-5a-4.3 leaderboard opt-in toggle (only meaningful when bound) */}
      <div className="rounded-md border border-emerald-200/40 bg-white/40 p-3 dark:border-emerald-900/40 dark:bg-slate-900/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {s.leaderboardLabel}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {hint}
            </p>
            <Link
              href={`/${locale}/rank`}
              className="mt-1 inline-block text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              {s.leaderboardLink}
            </Link>
          </div>
          <button
            type="button"
            onClick={handleToggleLeaderboard}
            disabled={savingLeaderboard}
            aria-pressed={showLeaderboard}
            className={cn(
              "relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors disabled:opacity-50",
              showLeaderboard
                ? "bg-emerald-500"
                : "bg-slate-300 dark:bg-slate-700",
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                showLeaderboard ? "translate-x-5" : "translate-x-1",
              )}
            />
            {savingLeaderboard ? (
              <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
            ) : null}
          </button>
        </div>
      </div>

      {err ? (
        <div className="text-xs text-red-500">
          {s.errorPrefix}
          {err}
        </div>
      ) : null}
    </div>
  );
}
