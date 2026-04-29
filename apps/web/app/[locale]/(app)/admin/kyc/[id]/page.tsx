import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { getKycSubmissionServer } from "@/lib/api/kyc-server";
import { AdminKycActions } from "@/components/admin/admin-kyc-actions";
import { AdminKycImage } from "@/components/admin/admin-kyc-image";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待審核",
  APPROVED: "已通過",
  REJECTED: "已退回",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber/20 text-amber",
  APPROVED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/20 text-red-600 dark:text-red-400",
};

export default async function AdminKycDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const submissionId = Number(id);
  if (!Number.isFinite(submissionId)) notFound();

  const submission = await getKycSubmissionServer(submissionId, cookieHeader);
  if (!submission) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/${locale}/admin/kyc`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← 返回列表
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            審核 #{submission.id}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[submission.status]}`}
          >
            {STATUS_LABEL[submission.status]}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申請人</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="姓名" value={submission.user_display_name ?? "—"} />
          <Row label="Email" value={submission.user_email} />
          <Row label="提交時間" value={new Date(submission.created_at).toLocaleString("zh-TW")} />
          {submission.reviewed_at ? (
            <Row label="審核時間" value={new Date(submission.reviewed_at).toLocaleString("zh-TW")} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>身分資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="法定姓名" value={submission.legal_name ?? "—"} />
          <Row label="證件號碼" value={submission.id_number ?? "—"} />
          <Row label="出生日期" value={submission.birth_date ?? "—"} />
          <Row label="國家" value={submission.country ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>證件影像</CardTitle>
          <CardDescription>點擊圖片可開新分頁放大</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {submission.has_id_front ? (
            <AdminKycImage submissionId={submission.id} which="id_front" label="證件正面" />
          ) : null}
          {submission.has_id_back ? (
            <AdminKycImage submissionId={submission.id} which="id_back" label="證件反面" />
          ) : null}
          {submission.has_selfie ? (
            <AdminKycImage submissionId={submission.id} which="selfie" label="自拍照" />
          ) : null}
        </CardContent>
      </Card>

      {submission.status === "REJECTED" && submission.reject_reason ? (
        <Card>
          <CardHeader>
            <CardTitle>退回原因</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700 dark:text-red-300">
              {submission.reject_reason}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {submission.status === "PENDING" ? (
        <AdminKycActions submissionId={submission.id} locale={locale} />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
