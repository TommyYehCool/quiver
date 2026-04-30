import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { fetchFeePayerServer, listAdminWithdrawalsServer } from "@/lib/api/withdrawal-server";
import type { WithdrawalStatus } from "@/lib/api/withdrawal";

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "等待審核",
  APPROVED: "等待廣播",
  PROCESSING: "處理中",
  BROADCASTING: "廣播中",
  COMPLETED: "已完成",
  REJECTED: "已退回",
  FAILED: "失敗",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-violet-500/20 text-violet-700 dark:text-violet-400",
  PROCESSING: "bg-sky-500/20 text-sky-700 dark:text-sky-400",
  BROADCASTING: "bg-sky-500/20 text-sky-700 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-red-500/20 text-red-600 dark:text-red-400",
  FAILED: "bg-red-500/20 text-red-600 dark:text-red-400",
};

const STATUSES: { value: WithdrawalStatus | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "PENDING_REVIEW", label: "等待審核" },
  { value: "APPROVED", label: "等待廣播" },
  { value: "COMPLETED", label: "已完成" },
  { value: "REJECTED", label: "已退回" },
];

export default async function AdminWithdrawalsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { status?: string; page?: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const status = (searchParams.status as WithdrawalStatus | undefined) || undefined;
  const page = Number(searchParams.page) || 1;
  const pageSize = 20;

  const [data, feePayer] = await Promise.all([
    listAdminWithdrawalsServer(cookieHeader, { status, page, pageSize }),
    fetchFeePayerServer(cookieHeader),
  ]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">提領審核</h1>
        <p className="mt-1 text-sm text-slate-500">
          審核大額(≥ $1000)提領申請。小額會自動 APPROVED,直接由 worker 廣播。
        </p>
      </div>

      {feePayer?.low_balance_warning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700 dark:text-amber-400" />
          <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">
              FEE_PAYER 餘額過低 ({feePayer.trx_balance} TRX)— 新提領申請已暫停
            </p>
            <p className="mt-0.5 text-xs">
              系統已自動阻擋使用者送新提領,直到 FEE_PAYER ≥ 100 TRX。
              請從 Shasta faucet 補 TRX 到{" "}
              <Link
                href={`/${locale}/admin/platform`}
                className="underline"
              >
                FEE_PAYER 地址
              </Link>。
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={s.value
              ? `/${locale}/admin/withdrawals?status=${s.value}`
              : `/${locale}/admin/withdrawals`}
            className={
              (s.value || "") === (status || "")
                ? "rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-cream-edge bg-paper px-4 py-1.5 text-xs text-slate-600 hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }
          >
            {s.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申請列表</CardTitle>
          <CardDescription>共 {data?.total ?? 0} 筆</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-edge text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">使用者</th>
                    <th className="py-2 pr-4">金額</th>
                    <th className="py-2 pr-4">收款地址</th>
                    <th className="py-2 pr-4">狀態</th>
                    <th className="py-2 pr-4">送出時間</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-cream-edge/60 transition-colors hover:bg-cream/30 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 text-slate-500">#{w.id}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/${locale}/admin/withdrawals/${w.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {w.user_display_name ?? w.user_email}
                        </Link>
                        <div className="text-xs text-slate-500">{w.user_email}</div>
                      </td>
                      <td className="py-3 pr-4 font-semibold tabular-nums">
                        {w.amount}
                        <span className="ml-1 text-xs font-normal text-slate-500">+ {w.fee} fee</span>
                      </td>
                      <td className="max-w-[180px] truncate py-3 pr-4 font-mono text-xs">{w.to_address}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[w.status]}`}
                        >
                          {STATUS_LABEL[w.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {new Date(w.created_at).toLocaleString("zh-TW")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">沒有符合條件的紀錄</p>
          )}

          {totalPages > 1 ? (
            <div className="mt-4 flex justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const params = new URLSearchParams();
                if (status) params.set("status", status);
                params.set("page", String(p));
                return (
                  <Link
                    key={p}
                    href={`/${locale}/admin/withdrawals?${params.toString()}`}
                    className={
                      p === page
                        ? "rounded-md bg-brand px-3 py-1 text-white"
                        : "rounded-md border border-cream-edge bg-paper px-3 py-1 text-slate-600 hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }
                  >
                    {p}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
