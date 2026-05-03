import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import { fetchEarnMeServer } from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutoLendToggle } from "@/components/earn/auto-lend-toggle";
import { ActiveCreditRow } from "@/components/earn/active-credit-row";
import type { EarnPositionStatus } from "@/lib/api/earn-user";

function fmtUsd(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return `${(n * 100).toFixed(2)}%`;
}

const STATUS_LABEL: Record<EarnPositionStatus, { label: string; tone: string }> = {
  pending_outbound: { label: "準備發送", tone: "bg-slate-500/20 text-slate-700 dark:text-slate-300" },
  onchain_in_flight: {
    label: "鏈上轉帳中",
    tone: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  },
  funding_idle: {
    label: "Bitfinex 已收到,準備掛單",
    tone: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  },
  lent: { label: "已借出,計息中", tone: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
  closing: { label: "贖回中", tone: "bg-orange-500/20 text-orange-700 dark:text-orange-300" },
  closed_external: { label: "已贖回", tone: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400" },
  failed: { label: "失敗 — 請聯絡 admin", tone: "bg-red-500/20 text-red-700 dark:text-red-300" },
};

export default async function EarnPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const earn = await fetchEarnMeServer(cookieHeader);
  if (!earn) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            無法載入 Earn 資料,請稍後再試或聯絡 admin。
          </CardContent>
        </Card>
      </div>
    );
  }

  const setupComplete = earn.has_earn_account && earn.bitfinex_connected;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
          <TrendingUp className="h-6 w-6 text-emerald-700" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Earn</h1>
          <p className="text-sm text-slate-500">
            Quiver 自動把你的 USDT 送到你 Bitfinex Funding wallet 並掛 funding offer 賺利息
          </p>
        </div>
      </div>

      {/* KYC gate */}
      {earn.kyc_status !== "APPROVED" && (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="flex-row items-start gap-3">
            <ShieldCheck className="h-5 w-5 flex-none text-amber-600" />
            <div className="flex-1">
              <CardTitle className="text-base">先完成 KYC 驗證</CardTitle>
              <CardDescription>
                Earn 功能需要先通過 KYC。當前狀態:
                <span className="ml-1 font-mono text-xs">{earn.kyc_status}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/${locale}/kyc`}>
                去 KYC <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No setup yet — connect CTA */}
      {earn.kyc_status === "APPROVED" && !setupComplete && (
        <Card>
          <CardHeader>
            <CardTitle>連接你的 Bitfinex 帳號</CardTitle>
            <CardDescription>
              提供你的 Bitfinex API key + Funding wallet 入金地址,Quiver 會自動把你存進來的 USDT 送過去並掛 funding offer。
              你的錢始終在你自己 KYC 過的 Bitfinex 帳號裡,Quiver 沒有提現權限。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={`/${locale}/earn/connect`}>
                開始連接 <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/earn/setup-guide`}>查看完整教學</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active state — main dashboard */}
      {setupComplete && (
        <>
          {/* Big numbers */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>已借出 (賺息中)</CardDescription>
                <CardTitle className="font-mono text-2xl">{fmtUsd(earn.lent_usdt)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                由 margin trader 接走,每日結算
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>等待掛單 (Funding idle)</CardDescription>
                <CardTitle className="font-mono text-2xl">{fmtUsd(earn.funding_idle_usdt)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                Bitfinex Funding wallet 待掛 offer
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>當日累計賺到</CardDescription>
                <CardTitle className="font-mono text-2xl text-emerald-600">
                  {fmtUsd(earn.daily_earned_usdt)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">最新 snapshot 估算</CardContent>
            </Card>
          </div>

          {/* Active loans (live from Bitfinex) — rate + interest + countdown */}
          {earn.active_credits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>目前借出</CardTitle>
                <CardDescription>
                  Bitfinex 上正在計息的 funding loans。每筆借期到期後自動回 funding wallet,系統會 auto-renew 重新掛單。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earn.active_credits.map((c) => (
                    <ActiveCreditRow key={c.id} credit={c} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-lend toggle */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Auto-lend 自動放貸</CardTitle>
                <CardDescription>
                  打開時:每筆新存進 Quiver 的 USDT 會自動送到你 Bitfinex 並掛 offer。
                  關掉時:**新** deposit 不會自動進入 Bitfinex(已借出的部位不受影響,自然到期回 funding wallet)。
                </CardDescription>
              </div>
              <AutoLendToggle initial={earn.auto_lend_enabled} />
            </CardHeader>
          </Card>

          {/* Pipeline status */}
          {earn.active_positions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>進行中的部位</CardTitle>
                <CardDescription>每筆 deposit 從進 Quiver 到掛上 offer 的 pipeline 狀態</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earn.active_positions.map((p) => {
                    const meta = STATUS_LABEL[p.status] ?? STATUS_LABEL.failed;
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col gap-2 rounded-lg border border-cream-edge bg-paper p-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Coins className="h-4 w-4 text-slate-400" />
                          <span className="font-mono">{fmtUsd(p.amount)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${meta.tone}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.bitfinex_offer_id && `offer #${p.bitfinex_offer_id}`}
                          {p.last_error && (
                            <span className="text-red-500">⚠ {p.last_error.slice(0, 80)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent snapshots */}
          {earn.recent_snapshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>最近 30 天</CardTitle>
                <CardDescription>每日 snapshot — funding / lent / 當日 earned</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                        <th className="py-2">日期</th>
                        <th className="py-2 text-right">Funding</th>
                        <th className="py-2 text-right">Lent</th>
                        <th className="py-2 text-right">當日賺</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earn.recent_snapshots.slice(-10).reverse().map((s) => (
                        <tr key={s.snapshot_date} className="border-b border-cream-edge/50 dark:border-slate-800">
                          <td className="py-2 font-mono">{s.snapshot_date}</td>
                          <td className="py-2 text-right font-mono">{fmtUsd(s.bitfinex_funding_usdt)}</td>
                          <td className="py-2 text-right font-mono">{fmtUsd(s.bitfinex_lent_usdt)}</td>
                          <td className="py-2 text-right font-mono text-emerald-600">
                            {fmtUsd(s.bitfinex_daily_earned)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bitfinex connected info footer */}
          <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
            <CardContent className="flex flex-col gap-2 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>已連接 Bitfinex · 入金地址</span>
                <code className="font-mono text-[10px]">
                  {earn.bitfinex_funding_address?.slice(0, 8)}...{earn.bitfinex_funding_address?.slice(-6)}
                </code>
              </div>
              <Link
                href={`/${locale}/earn/setup-guide`}
                className="text-xs text-brand hover:underline"
              >
                查看設定教學 →
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
