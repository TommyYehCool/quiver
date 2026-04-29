"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { approveKyc, rejectKyc } from "@/lib/api/kyc";

export function AdminKycActions({
  submissionId,
  locale,
}: {
  submissionId: number;
  locale: string;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleApprove() {
    if (!confirm("確認核准這筆 KYC 申請?系統會寄通知 email。")) return;
    setBusy("approve");
    setError(null);
    try {
      await approveKyc(submissionId);
      router.push(`/${locale}/admin/kyc`);
      router.refresh();
    } catch (e) {
      setError((e as { code?: string }).code ?? "操作失敗");
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    if (reason.trim().length === 0) {
      setError("請填寫退回原因");
      return;
    }
    if (!confirm("確認退回這筆 KYC 申請?系統會寄通知 email。")) return;
    setBusy("reject");
    setError(null);
    try {
      await rejectKyc(submissionId, reason.trim());
      router.push(`/${locale}/admin/kyc`);
      router.refresh();
    } catch (e) {
      setError((e as { code?: string }).code ?? "操作失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>審核動作</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="reason" className="text-sm font-medium">
            退回原因(僅退回時必填)
          </label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如:證件影像模糊、自拍與證件不符等"
            rows={3}
            disabled={busy !== null}
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button onClick={handleApprove} disabled={busy !== null} className="flex-1">
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            核准
          </Button>
          <Button
            onClick={handleReject}
            variant="destructive"
            disabled={busy !== null}
            className="flex-1"
          >
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            退回
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
