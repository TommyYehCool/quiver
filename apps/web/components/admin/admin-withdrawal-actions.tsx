"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  adminApproveWithdrawal,
  adminForceFailWithdrawal,
  adminRejectWithdrawal,
} from "@/lib/api/withdrawal";

type Action = "approve" | "reject" | "force_fail";

export function AdminWithdrawalActions({
  withdrawalId,
  locale,
  status,
}: {
  withdrawalId: number;
  locale: string;
  status: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isPendingReview = status === "PENDING_REVIEW";
  const isApproved = status === "APPROVED";
  const isProcessing = status === "PROCESSING";

  async function run(action: Action, fn: () => Promise<unknown>, opts: ConfirmOptions) {
    const ok = await confirm(opts);
    if (!ok) return;
    setBusy(action);
    setError(null);
    try {
      await fn();
      router.push(`/${locale}/admin/withdrawals`);
      router.refresh();
    } catch (e) {
      setError((e as { code?: string }).code ?? "操作失敗");
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    return run(
      "approve",
      () => adminApproveWithdrawal(withdrawalId),
      {
        title: "核准這筆提領?",
        body: "worker 會立刻自動廣播上鏈。",
        confirmLabel: "核准",
      },
    );
  }

  async function handleReject() {
    if (reason.trim().length === 0) {
      setError("請填寫退回原因");
      return;
    }
    return run(
      "reject",
      () => adminRejectWithdrawal(withdrawalId, reason.trim()),
      {
        title: "退回這筆提領?",
        body: "系統會 REVERSE ledger 退款給用戶。",
        variant: "danger",
        confirmLabel: "退回",
      },
    );
  }

  async function handleForceFail() {
    if (reason.trim().length === 0) {
      setError("請填寫操作原因");
      return;
    }
    return run(
      "force_fail",
      () => adminForceFailWithdrawal(withdrawalId, reason.trim()),
      {
        title: "強制標 FAILED + REVERSE",
        body: "你應該已經去 Shasta explorer 確認這筆 tx 沒實際送上鏈。\n\nForce-fail 會 REVERSE ledger 把錢退給用戶。\n如果鏈上其實有送出 → 會造成雙花!",
        variant: "danger",
        confirmLabel: "確定強制 FAIL",
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>審核動作</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProcessing ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <p>
              這筆提領卡在 <strong>PROCESSING</strong> — 通常是 worker 在廣播中途 crash。
              在點 force-fail 前,請務必去 Shasta explorer 用 user 地址查最近交易,
              確認這筆 tx <strong>沒有真的送上鏈</strong>。
              如果鏈上已經送出,但我們的 DB 沒記錄,請改用 SQL 手動更新 status + tx_hash。
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="reason" className="text-sm font-medium">
            原因(reject / force-fail 時必填)
          </label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isProcessing
                ? "例如:已在 explorer 確認 tx 不存在,worker 在簽 tx 階段 crash"
                : "例如:收款地址疑似有風險、用戶要求取消等"
            }
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
          {isPendingReview ? (
            <Button onClick={handleApprove} disabled={busy !== null} className="flex-1">
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              核准
            </Button>
          ) : null}
          {(isPendingReview || isApproved) ? (
            <Button
              onClick={handleReject}
              variant="destructive"
              disabled={busy !== null}
              className="flex-1"
            >
              {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              退回
            </Button>
          ) : null}
          {isProcessing ? (
            <Button
              onClick={handleForceFail}
              variant="destructive"
              disabled={busy !== null}
              className="flex-1"
            >
              {busy === "force_fail" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              強制標 FAILED + REVERSE
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
