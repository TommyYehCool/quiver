import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ChevronRight,
  Coins,
  Crown,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import {
  fetchEarnRankingServer,
  listEarnAccountsServer,
} from "@/lib/api/earn-server";
import { AddFriendButton } from "@/components/admin/earn/add-friend-button";
import {
  ArchiveAccountButton,
  SyncAccountButton,
  SyncAllButton,
} from "@/components/admin/earn/account-actions";

const TIER_BADGE: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  internal: {
    label: "Internal",
    color: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    icon: <Crown className="h-3 w-3" />,
  },
  friend: {
    label: "Friend",
    color: "bg-pink-500/20 text-pink-700 dark:text-pink-300",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  commercial: {
    label: "Commercial",
    color: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    icon: <TrendingUp className="h-3 w-3" />,
  },
};

function fmtUsd(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return `${n.toFixed(2)}%`;
}

export default async function AdminEarnPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const [accountsResp, ranking] = await Promise.all([
    listEarnAccountsServer(cookieHeader, { includeArchived: false }),
    fetchEarnRankingServer(cookieHeader),
  ]);

  const accounts = accountsResp?.items ?? [];
  const totalAccounts = accountsResp?.total ?? 0;
  const friendCount = accounts.filter((a) => a.earn_tier === "friend").length;
  const internalCount = accounts.filter(
    (a) => a.earn_tier === "internal",
  ).length;

  // 統合 total
  let aggregateTotalUsdt = 0;
  let weightedApyAccum = 0;
  let totalForApy = 0;
  if (ranking) {
    for (const r of ranking) {
      const total = Number(r.total_usdt ?? 0);
      aggregateTotalUsdt += total;
      if (r.avg_30d_apy_pct !== null && total > 0) {
        weightedApyAccum += Number(r.avg_30d_apy_pct) * total;
        totalForApy += total;
      }
    }
  }
  const avgApy = totalForApy > 0 ? weightedApyAccum / totalForApy : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Earn — 朋友帳戶管理
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Friends Tooling F-Phase 1。每個朋友自己保管資金,Quiver 只是 read-only
            儀表板。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncAllButton />
          <AddFriendButton />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">總帳戶</p>
            <p className="mt-1 text-2xl font-semibold">{totalAccounts}</p>
            <p className="mt-1 text-xs text-slate-400">
              {friendCount} 朋友 + {internalCount} 自己
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">總部位</p>
            <p className="mt-1 text-2xl font-semibold">
              {fmtUsd(aggregateTotalUsdt.toFixed(2))}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              所有朋友 + 自己加總
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">平均 30d APY (估)</p>
            <p className="mt-1 text-2xl font-semibold">
              {avgApy !== null ? fmtPct(avgApy.toFixed(2)) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">部位加權平均</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">朋友人數上限</p>
            <p className="mt-1 text-2xl font-semibold">
              {friendCount} / 10
            </p>
            <p className="mt-1 text-xs text-slate-400">F-Phase 1 max 10</p>
          </CardContent>
        </Card>
      </div>

      {/* Ranking — APY leaderboard */}
      {ranking && ranking.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <Activity className="mr-2 inline h-4 w-4" />
              30 天 APY 排行
            </CardTitle>
            <CardDescription>
              用每天 snapshot 的 daily earned 平均估算。Bitfinex 為主,AAVE 部分用最近
              APR snapshot 加權。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-cream-edge dark:border-slate-700">
                  <th className="py-2 text-left font-normal">#</th>
                  <th className="py-2 text-left font-normal">User</th>
                  <th className="py-2 text-right font-normal">部位</th>
                  <th className="py-2 text-right font-normal">30d APY</th>
                  <th className="py-2 text-right font-normal">Bitfinex %</th>
                  <th className="py-2 text-right font-normal">AAVE %</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.earn_account_id}
                    className="border-b border-cream-edge/40 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-2.5 text-slate-400">{i + 1}</td>
                    <td className="py-2.5">
                      <Link
                        href={`/${locale}/admin/earn/${r.earn_account_id}`}
                        className="hover:underline"
                      >
                        {r.user_display_name || r.user_email}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {fmtUsd(r.total_usdt)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {fmtPct(r.avg_30d_apy_pct)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-slate-500">
                      {fmtPct(r.bitfinex_share_pct)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-slate-500">
                      {fmtPct(r.aave_share_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* Account list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <Coins className="mr-2 inline h-4 w-4" />
            帳戶列表
          </CardTitle>
          <CardDescription>
            點 user 進入詳情頁,看歷史 snapshot / Bitfinex 連線 / EVM 地址。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-cream-edge bg-paper/40 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
              <AlertCircle className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              還沒有任何 earn 帳戶。點右上角「加朋友」開始。
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => {
                const tierBadge = TIER_BADGE[a.earn_tier];
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-cream-edge bg-paper px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/${locale}/admin/earn/${a.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.user_display_name || a.user_email}
                        </Link>
                        {tierBadge ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tierBadge.color}`}
                          >
                            {tierBadge.icon}
                            {tierBadge.label}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {a.custody_mode}
                        </span>
                        {a.perf_fee_bps > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            fee {(a.perf_fee_bps / 100).toFixed(1)}%
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {a.user_email}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span>
                          Bitfinex:{" "}
                          {a.has_active_bitfinex ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ✓ {a.bitfinex_permissions}
                            </span>
                          ) : (
                            <span className="text-red-500">未連</span>
                          )}
                        </span>
                        <span>EVM: {a.evm_addresses_count} 個地址</span>
                        <span>
                          建立: {new Date(a.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <SyncAccountButton accountId={a.id} />
                      <ArchiveAccountButton
                        accountId={a.id}
                        archived={a.archived_at !== null}
                      />
                      <Link
                        href={`/${locale}/admin/earn/${a.id}`}
                        className="rounded-md p-2 text-slate-400 hover:bg-cream/40 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        🔒 所有 Bitfinex API key 用 AES-GCM + KEK 加密儲存。Quiver 不能 withdraw,
        朋友隨時可在 Bitfinex 撤銷 key。
      </p>
    </div>
  );
}
