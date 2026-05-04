import { cookies } from "next/headers";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Coins,
  Database,
  Flame,
  ShieldCheck,
  TrendingUp,
  UserMinus,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdminOverviewServer } from "@/lib/api/admin-overview-server";
import { cn } from "@/lib/utils";

export default async function AdminOverviewPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const overview = await fetchAdminOverviewServer(cookieHeader);

  if (overview === null) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          無法載入概覽資料 — 系統可能未初始化或連線異常。
        </p>
      </div>
    );
  }

  const insolvencyAlert = overview.platform_insolvent;
  const feePayerAlert = overview.fee_payer_low;
  const hasPendingTodos =
    overview.pending_kyc_count > 0 ||
    overview.pending_withdrawal_count > 0 ||
    overview.pending_deletion_count > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">管理員概覽</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          平台健康指標 + 待處理事項
        </p>
      </div>

      {/* 警示區 */}
      {insolvencyAlert || feePayerAlert ? (
        <div className="space-y-2">
          {insolvencyAlert ? (
            <AlertBox kind="critical" Icon={AlertTriangle}>
              <strong>⚠ INSOLVENCY:</strong> 平台對用戶有負債(profit ={" "}
              <code>{overview.platform_profit} USDT</code>)。HOT 不夠用戶 ledger 總額,需立即排查。
            </AlertBox>
          ) : null}
          {feePayerAlert ? (
            <AlertBox kind="warn" Icon={AlertTriangle}>
              <strong>FEE_PAYER 低餘額:</strong> {overview.fee_payer_trx_balance} TRX。低於 100 TRX
              會自動阻擋新提領申請。
            </AlertBox>
          ) : null}
        </div>
      ) : null}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          Icon={Users}
          label="用戶總數"
          value={overview.total_users.toString()}
          sub={`其中 ${overview.active_users} 個 ACTIVE`}
        />
        <KpiCard
          Icon={ShieldCheck}
          label="待審 KYC"
          value={overview.pending_kyc_count.toString()}
          alert={overview.pending_kyc_count > 0}
          href={overview.pending_kyc_count > 0 ? `/${locale}/admin/kyc` : undefined}
        />
        <KpiCard
          Icon={ClipboardList}
          label="待審提領"
          value={overview.pending_withdrawal_count.toString()}
          sub={`${overview.pending_withdrawal_amount} USDT 等審核`}
          alert={overview.pending_withdrawal_count > 0}
          href={overview.pending_withdrawal_count > 0 ? `/${locale}/admin/withdrawals` : undefined}
        />
        <KpiCard
          Icon={Flame}
          label="HOT USDT"
          value={overview.hot_usdt_balance}
          sub={`TRX ${overview.hot_trx_balance}`}
        />
        <KpiCard
          Icon={TrendingUp}
          label="平台獲利"
          value={overview.platform_profit}
          sub={`HOT − 在途 ${overview.in_flight_withdrawal_amount} − 用戶 ${overview.user_balances_total}`}
          alert={Number(overview.platform_profit) < 0}
          variant={Number(overview.platform_profit) < 0 ? "danger" : "success"}
        />
        <KpiCard
          Icon={Wallet}
          label="FEE_PAYER TRX"
          value={overview.fee_payer_trx_balance}
          sub="代付鏈上 gas"
          alert={feePayerAlert}
        />
        <KpiCard
          Icon={UserMinus}
          label="刪除申請"
          value={overview.pending_deletion_count.toString()}
          alert={overview.pending_deletion_count > 0}
          href={
            overview.pending_deletion_count > 0
              ? `/${locale}/admin/deletion-requests`
              : undefined
          }
        />
      </div>

      {/* 快速入口(若沒待辦,把所有 admin 子區塊列在這) */}
      {!hasPendingTodos ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              當前無待處理事項
            </CardTitle>
            <CardDescription>所有審核佇列都是空的。</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QuickLink locale={locale} href="kyc" Icon={ShieldCheck} label="KYC 歷史" />
            <QuickLink locale={locale} href="withdrawals" Icon={ClipboardList} label="提領紀錄" />
            <QuickLink locale={locale} href="platform" Icon={Database} label="平台帳戶" />
            <QuickLink locale={locale} href="audit" Icon={Coins} label="Audit log" />
            <QuickLink locale={locale} href="deletion-requests" Icon={UserMinus} label="刪除申請" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function KpiCard({
  Icon,
  label,
  value,
  sub,
  alert,
  href,
  variant,
}: {
  Icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  href?: string;
  variant?: "danger" | "success";
}) {
  const tone =
    variant === "danger"
      ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
      : variant === "success"
        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
        : alert
          ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          : "border-cream-edge bg-paper dark:border-slate-700 dark:bg-slate-800";
  const valueClass =
    variant === "danger"
      ? "text-rose-700 dark:text-rose-300"
      : variant === "success"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-slate-900 dark:text-slate-100";
  const inner = (
    <div className={cn("rounded-2xl border p-4 transition-shadow", tone, href ? "hover:shadow-md" : "")}>
      <p className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
      ) : null}
      {href ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-violet-700 dark:text-violet-400">
          處理 <ArrowRight className="h-3 w-3" />
        </p>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function AlertBox({
  kind,
  Icon,
  children,
}: {
  kind: "critical" | "warn";
  Icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const tone =
    kind === "critical"
      ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", tone)}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div>{children}</div>
    </div>
  );
}

function QuickLink({
  locale,
  href,
  Icon,
  label,
}: {
  locale: string;
  href: string;
  Icon: typeof Users;
  label: string;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/${locale}/admin/${href}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}
