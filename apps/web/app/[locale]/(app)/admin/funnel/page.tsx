/**
 * F-5b-4 — Admin onboarding funnel page.
 *
 * Two cards:
 *   1. Funnel chart — counts per stage with drop-off %
 *   2. Per-user table — sorted by stall time, lets Tommy see "who needs ping"
 *
 * Server-rendered. Auth-gated by admin layout.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  TrendingDown,
} from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import {
  fetchAdminFunnelOverview,
  fetchAdminFunnelUsers,
} from "@/lib/api/admin-funnel-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ${m % 60}m`;
  const days = Math.floor(m / (60 * 24));
  const hours = Math.floor((m % (60 * 24)) / 60);
  return `${days}d ${hours}h`;
}

/**
 * Map funnel event codes (services/funnel.py constants) to admin-friendly
 * Chinese labels. Unknown codes fall through unchanged so we don't
 * silently drop new events when funnel.py adds them — admin sees the
 * raw code as a hint to add a label here.
 */
const EVENT_LABEL_ZH: Record<string, string> = {
  // Onboarding
  signup_completed: "註冊完成",
  tos_accepted: "同意服務條款",
  // KYC
  kyc_form_opened: "打開 KYC 頁",
  kyc_submitted: "送出 KYC",
  kyc_approved: "KYC 通過",
  kyc_rejected: "KYC 退回",
  // Earn / Bitfinex setup
  bot_settings_opened: "打開放貸機器人設定",
  bitfinex_connect_attempted: "嘗試連接 Bitfinex",
  bitfinex_connect_failed: "Bitfinex 連接失敗",
  bitfinex_connect_succeeded: "Bitfinex 連接成功",
  // Money flow
  first_deposit_received: "首次入金到帳",
  first_lent_succeeded: "首次借出成功",
  // Engagement
  telegram_bound: "綁定 Telegram",
  leaderboard_optin_enabled: "啟用排行榜",
  strategy_preset_changed: "修改策略 preset",
  auto_lend_disabled: "關閉自動放貸",
  // Compliance / billing
  dunning_paused: "Quiver 暫停(欠費過久)",
  dunning_resumed: "Quiver 自動恢復",
};

function fmtEvent(code: string | null): string {
  if (!code) return "—";
  return EVENT_LABEL_ZH[code] ?? code;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminFunnelPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const me = await fetchMeServer(cookieHeader);
  if (!me || !me.roles.includes("ADMIN")) redirect(`/${locale}`);

  const [overview, users] = await Promise.all([
    fetchAdminFunnelOverview(cookieHeader),
    fetchAdminFunnelUsers(cookieHeader),
  ]);

  if (!overview || !users) {
    return (
      <div className="container mx-auto max-w-5xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            載入失敗,請稍後再試。
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find max user_count across stages for bar width normalization
  const maxCount = Math.max(...overview.stages.map((s) => s.user_count), 1);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Onboarding Funnel
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          每個用戶在 onboarding 流程的位置 + 停留時間。資料來自 funnel_events
          (F-5b-4)。
        </p>
      </div>

      {/* ─── Funnel chart ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            漏斗(Distinct user count per stage)
          </CardTitle>
          <CardDescription>
            總用戶 {overview.total_users} 位 ·
            {" "}最後註冊 {fmtDateTime(overview.last_signup_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.stages.map((stage, i) => {
            const widthPct = (stage.user_count / maxCount) * 100;
            const dropTone =
              stage.drop_off_pct === null
                ? ""
                : stage.drop_off_pct >= 50
                  ? "text-red-600 dark:text-red-400"
                  : stage.drop_off_pct >= 20
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500";
            return (
              <div key={stage.event_name} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="w-6 font-mono text-xs text-slate-400">
                      {i + 1}.
                    </span>
                    <span className="font-medium">{stage.label}</span>
                    <span className="font-mono text-xs text-slate-400">
                      ({stage.event_name})
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    {stage.drop_off_pct !== null ? (
                      <span className={cn("flex items-center gap-1 text-xs font-mono", dropTone)}>
                        <TrendingDown className="h-3 w-3" />
                        -{stage.drop_off_pct}%
                      </span>
                    ) : null}
                    <span className="font-mono text-base font-semibold tabular-nums">
                      {stage.user_count}
                    </span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded bg-emerald-500 transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ─── Per-user state table (sorted by stall time desc) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Per-user state(stall 最久的排前面)
          </CardTitle>
          <CardDescription>
            「stalled」= 距離 last funnel event 多久。值大代表卡住,值得 ping。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile: stacked card list (md+ swaps to wide table). 8 cols
              don't fit even with overflow-x-auto on iPhone — content gets
              clipped without showing a scrollbar. */}
          <div className="space-y-2 md:hidden">
            {users.map((u) => (
              <div
                key={u.user_id}
                className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px]">{u.email}</div>
                    <div className="text-[10px] text-slate-400">
                      #{u.user_id} · 註冊 {fmtDateTime(u.signup_at)}
                    </div>
                  </div>
                  <div className={cn(
                    "flex-none font-mono text-sm font-semibold tabular-nums",
                    u.stalled_minutes !== null && u.stalled_minutes > 60 * 24
                      ? "text-red-600 dark:text-red-400"
                      : u.stalled_minutes !== null && u.stalled_minutes > 60 * 4
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-500",
                  )}>
                    {fmtMinutes(u.stalled_minutes)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <TierBadge tier={u.earn_tier} />
                  <KycBadge status={u.kyc_status} />
                  <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                    {u.bitfinex_connected ? (
                      <><CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> Bitfinex</>
                    ) : (
                      <><AlertTriangle className="h-2.5 w-2.5 text-slate-300" /> Bitfinex</>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                    <Send className={cn(
                      "h-2.5 w-2.5",
                      u.telegram_bound ? "text-emerald-500" : "text-slate-300",
                    )} /> TG
                  </span>
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500">
                  最近事件:<span>{fmtEvent(u.last_event_name)}</span>
                  {u.last_event_at ? (
                    <span className="ml-1 text-slate-400">@ {fmtDateTime(u.last_event_at)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop (md+): wide table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 px-2">Tier</th>
                  <th className="py-2 px-2">KYC</th>
                  <th className="py-2 px-2">Bitfinex</th>
                  <th className="py-2 px-2">TG</th>
                  <th className="py-2 px-2">最近事件</th>
                  <th className="py-2 px-2 text-right">時間</th>
                  <th className="py-2 pl-2 text-right">停滯</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b border-cream-edge/50 dark:border-slate-800">
                    <td className="py-2 pr-2">
                      <div className="font-mono text-[11px]">{u.email}</div>
                      <div className="text-[10px] text-slate-400">
                        #{u.user_id} · 註冊 {fmtDateTime(u.signup_at)}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <TierBadge tier={u.earn_tier} />
                    </td>
                    <td className="py-2 px-2">
                      <KycBadge status={u.kyc_status} />
                    </td>
                    <td className="py-2 px-2">
                      {u.bitfinex_connected ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-slate-300" />
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {u.telegram_bound ? (
                        <Send className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Send className="h-3.5 w-3.5 text-slate-300" />
                      )}
                    </td>
                    <td className="py-2 px-2 text-[11px]" title={u.last_event_name ?? ""}>
                      {fmtEvent(u.last_event_name)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[10px] text-slate-500">
                      {fmtDateTime(u.last_event_at)}
                    </td>
                    <td className={cn(
                      "py-2 pl-2 text-right font-mono text-xs tabular-nums",
                      u.stalled_minutes !== null && u.stalled_minutes > 60 * 24
                        ? "text-red-600 dark:text-red-400 font-semibold"
                        : u.stalled_minutes !== null && u.stalled_minutes > 60 * 4
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-500",
                    )}>
                      {fmtMinutes(u.stalled_minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-50/30 dark:bg-slate-900/30">
        <CardContent className="py-3 text-xs text-slate-500">
          💡 <span className="font-mono">stalled</span> 顏色:綠 = &lt;4h · 黃 = 4-24h · 紅 = &gt;24h(可能該主動 ping)。
          KYC <code>—</code> 代表沒做。
        </CardContent>
      </Card>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const tone =
    tier === "friend"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tier === "internal"
        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
        : tier === "public"
          ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
          : "bg-slate-200/40 text-slate-500 dark:bg-slate-800/40";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {tier}
    </span>
  );
}

function KycBadge({ status }: { status: string | null }) {
  if (status === null) {
    return <span className="text-[10px] text-slate-400">—</span>;
  }
  const tone =
    status === "APPROVED"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "REJECTED"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {status}
    </span>
  );
}
