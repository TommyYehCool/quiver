import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { getEarnAccountDetailServer } from "@/lib/api/earn-server";
import {
  ArchiveAccountButton,
  SyncAccountButton,
} from "@/components/admin/earn/account-actions";

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
  return `${(n * 100).toFixed(2)}%`;
}

export default async function AdminEarnAccountDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const accountId = Number(id);
  if (!Number.isFinite(accountId)) notFound();

  const detail = await getEarnAccountDetailServer(accountId, cookieHeader);
  if (!detail) notFound();

  const latestSnap = detail.recent_snapshots[detail.recent_snapshots.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href={`/${locale}/admin/earn`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-3 w-3" />
          回 Earn 列表
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {detail.user_display_name || detail.user_email}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{detail.user_email}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-700">
                tier: {detail.earn_tier}
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-700">
                custody: {detail.custody_mode}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                fee: {(detail.perf_fee_bps / 100).toFixed(1)}%
              </span>
              {detail.archived_at ? (
                <span className="rounded-full bg-slate-300 px-2 py-0.5 text-slate-700 dark:bg-slate-600">
                  archived
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncAccountButton accountId={detail.id} />
            <ArchiveAccountButton
              accountId={detail.id}
              archived={detail.archived_at !== null}
            />
          </div>
        </div>
      </div>

      {/* Latest position summary */}
      {latestSnap ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最新部位 ({latestSnap.snapshot_date})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Bitfinex Idle</p>
                <p className="mt-1 font-mono text-sm">
                  {fmtUsd(latestSnap.bitfinex_funding_usdt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Bitfinex Lent</p>
                <p className="mt-1 font-mono text-sm">
                  {fmtUsd(latestSnap.bitfinex_lent_usdt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">AAVE Polygon</p>
                <p className="mt-1 font-mono text-sm">
                  {fmtUsd(latestSnap.aave_polygon_usdt)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  APR: {fmtPct(latestSnap.aave_daily_apr)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">總計</p>
                <p className="mt-1 font-mono text-base font-semibold">
                  {fmtUsd(latestSnap.total_usdt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            還沒有 snapshot。點右上角「同步」抓最新部位。
          </CardContent>
        </Card>
      )}

      {/* Bitfinex connections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <KeyRound className="mr-2 inline h-4 w-4" />
            Bitfinex 連線
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.bitfinex_connections.length === 0 ? (
            <p className="text-sm text-slate-500">沒有任何連線。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-cream-edge dark:border-slate-700">
                  <th className="py-2 text-left font-normal">ID</th>
                  <th className="py-2 text-left font-normal">類型</th>
                  <th className="py-2 text-left font-normal">權限</th>
                  <th className="py-2 text-left font-normal">建立</th>
                  <th className="py-2 text-left font-normal">狀態</th>
                </tr>
              </thead>
              <tbody>
                {detail.bitfinex_connections.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-cream-edge/40 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-2 font-mono text-xs text-slate-400">
                      #{c.id}
                    </td>
                    <td className="py-2 text-xs">
                      {c.is_platform_key ? "platform 共用" : "self-custody"}
                    </td>
                    <td className="py-2 text-xs">{c.permissions}</td>
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-xs">
                      {c.revoked_at ? (
                        <span className="text-slate-400">
                          已撤銷 {new Date(c.revoked_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ✓ active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* EVM addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Wallet className="mr-2 inline h-4 w-4" />
            EVM 地址
          </CardTitle>
          <CardDescription>
            self-custody 模式下,這些是朋友自己 wallet 的地址(Quiver 純讀)。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.evm_addresses.length === 0 ? (
            <p className="text-sm text-slate-500">尚未設定 EVM 地址。</p>
          ) : (
            <ul className="space-y-2">
              {detail.evm_addresses.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-cream-edge bg-paper/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium dark:bg-slate-700">
                        {a.chain}
                      </span>
                      {a.label ? (
                        <span className="text-sm">{a.label}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {a.address}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {a.is_platform_address ? "platform" : "self"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent snapshots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近 30 天 snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.recent_snapshots.length === 0 ? (
            <p className="text-sm text-slate-500">沒有歷史 snapshot。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-cream-edge dark:border-slate-700">
                  <th className="py-2 text-left font-normal">日期</th>
                  <th className="py-2 text-right font-normal">BX Idle</th>
                  <th className="py-2 text-right font-normal">BX Lent</th>
                  <th className="py-2 text-right font-normal">BX Earned</th>
                  <th className="py-2 text-right font-normal">AAVE</th>
                  <th className="py-2 text-right font-normal">總計</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.recent_snapshots].reverse().map((s) => (
                  <tr
                    key={s.snapshot_date}
                    className="border-b border-cream-edge/40 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-2 text-xs text-slate-500">
                      {s.snapshot_date}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {fmtUsd(s.bitfinex_funding_usdt)}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {fmtUsd(s.bitfinex_lent_usdt)}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {fmtUsd(s.bitfinex_daily_earned)}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {fmtUsd(s.aave_polygon_usdt)}
                    </td>
                    <td className="py-2 text-right font-mono text-xs font-medium">
                      {fmtUsd(s.total_usdt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* F-Phase 3 Path A:auto-lend pipeline status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Auto-Lend Pipeline (F-3 Path A)
          </CardTitle>
          <CardDescription className="text-xs">
            auto_lend_enabled: <code>{String(detail.auto_lend_enabled)}</code>
            {" · "}funding_address:{" "}
            <code className="font-mono text-xs">
              {detail.bitfinex_funding_address ?? "(not set)"}
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.pipeline_positions.length === 0 ? (
            <p className="text-xs text-slate-500">沒有 pipeline 紀錄</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                  <th className="py-2 font-normal">id</th>
                  <th className="py-2 font-normal">status</th>
                  <th className="py-2 text-right font-normal">amount</th>
                  <th className="py-2 font-normal">offer_id</th>
                  <th className="py-2 font-normal">tx_hash</th>
                  <th className="py-2 font-normal">created</th>
                  <th className="py-2 font-normal">last_error</th>
                </tr>
              </thead>
              <tbody>
                {detail.pipeline_positions.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-cream-edge/40 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-2 font-mono">{p.id}</td>
                    <td className="py-2">
                      <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">
                        {p.status}
                      </code>
                      {p.retry_count > 0 && (
                        <span className="ml-1 text-amber-600">↻{p.retry_count}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{fmtUsd(p.amount)}</td>
                    <td className="py-2 font-mono text-xs">
                      {p.bitfinex_offer_id ?? "—"}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {p.onchain_tx_hash
                        ? `${p.onchain_tx_hash.slice(0, 8)}…${p.onchain_tx_hash.slice(-6)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-xs text-red-500">
                      {p.last_error?.slice(0, 60) ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {detail.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {detail.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
