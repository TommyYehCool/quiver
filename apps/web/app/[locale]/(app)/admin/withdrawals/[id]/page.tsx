import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { getAdminWithdrawalServer } from "@/lib/api/withdrawal-server";
import { AdminWithdrawalActions } from "@/components/admin/admin-withdrawal-actions";

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

export default async function AdminWithdrawalDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const wId = Number(id);
  if (!Number.isFinite(wId)) notFound();
  const w = await getAdminWithdrawalServer(wId, cookieHeader);
  if (!w) notFound();

  const canActOn = w.status === "PENDING_REVIEW" || w.status === "APPROVED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/withdrawals`} className="text-sm text-slate-500 hover:underline">
          ← 返回列表
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">提領 #{w.id}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[w.status]}`}>
            {STATUS_LABEL[w.status]}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申請資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="申請人" value={`${w.user_display_name ?? "—"}(${w.user_email})`} />
          <Row label="金額" value={`${w.amount} USDT`} />
          <Row label="手續費" value={`${w.fee} USDT`} />
          <Row label="總計從餘額扣" value={`${(Number(w.amount) + Number(w.fee)).toFixed(6)} USDT`} />
          <Row label="收款地址" value={w.to_address} mono />
          <Row label="送出時間" value={new Date(w.created_at).toLocaleString("zh-TW")} />
          {w.reviewed_at ? (
            <Row label="審核時間" value={new Date(w.reviewed_at).toLocaleString("zh-TW")} />
          ) : null}
          {w.tx_hash ? <Row label="鏈上 tx" value={w.tx_hash} mono /> : null}
        </CardContent>
      </Card>

      {w.status === "REJECTED" && w.reject_reason ? (
        <Card>
          <CardHeader>
            <CardTitle>退回原因</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700 dark:text-red-300">{w.reject_reason}</p>
          </CardContent>
        </Card>
      ) : null}

      {canActOn ? <AdminWithdrawalActions withdrawalId={w.id} locale={locale} status={w.status} /> : null}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-cream-edge/60 pb-2 last:border-0 dark:border-slate-800">
      <span className="flex-none text-slate-500">{label}</span>
      <span className={mono ? "break-all text-right font-mono text-xs" : "text-right font-medium"}>{value}</span>
    </div>
  );
}
