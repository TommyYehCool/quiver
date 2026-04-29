import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { listKycSubmissionsServer } from "@/lib/api/kyc-server";
import type { KycStatus } from "@/lib/api/kyc";

const STATUSES: { value: KycStatus | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待審核" },
  { value: "APPROVED", label: "已通過" },
  { value: "REJECTED", label: "已退回" },
];

const STATUS_LABEL: Record<KycStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已通過",
  REJECTED: "已退回",
};

const STATUS_COLOR: Record<KycStatus, string> = {
  PENDING: "bg-amber/20 text-amber",
  APPROVED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/20 text-red-600 dark:text-red-400",
};

export default async function AdminKycListPage({
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

  const status = (searchParams.status as KycStatus | undefined) || undefined;
  const page = Number(searchParams.page) || 1;
  const pageSize = 20;

  const data = await listKycSubmissionsServer(cookieHeader, {
    status,
    page,
    pageSize,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC 審核</h1>
        <p className="mt-1 text-sm text-slate-500">管理員審核使用者送出的身分驗證資料。</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={
              s.value
                ? `/${locale}/admin/kyc?status=${s.value}`
                : `/${locale}/admin/kyc`
            }
            className={
              (s.value || "") === (status || "")
                ? "rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">使用者</th>
                    <th className="py-2 pr-4">姓名</th>
                    <th className="py-2 pr-4">國家</th>
                    <th className="py-2 pr-4">狀態</th>
                    <th className="py-2 pr-4">送出時間</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 text-slate-500">#{it.id}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/${locale}/admin/kyc/${it.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {it.user_display_name ?? it.user_email}
                        </Link>
                        <div className="text-xs text-slate-500">{it.user_email}</div>
                      </td>
                      <td className="py-3 pr-4">{it.legal_name ?? "—"}</td>
                      <td className="py-3 pr-4">{it.country ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[it.status]}`}
                        >
                          {STATUS_LABEL[it.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {new Date(it.created_at).toLocaleString("zh-TW")}
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
                    href={`/${locale}/admin/kyc?${params.toString()}`}
                    className={
                      p === page
                        ? "rounded-md bg-brand px-3 py-1 text-white"
                        : "rounded-md border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
