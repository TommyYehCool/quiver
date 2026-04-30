"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Coins, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  feeWithdraw,
  fetchOutboundQuota,
  type FeeWithdrawResult,
  type OutboundQuota,
} from "@/lib/api/withdrawal";
import { fetchTwoFAStatus } from "@/lib/api/twofa";

const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * 平台獲利提領按鈕(phase 6E-2.5)。
 *
 * 點下去 → 開 modal:
 *   - 顯示當前 platform_profit (= HOT 鏈上 - user ledger)
 *   - 輸入 to_address + amount
 *   - 若 admin 有 2FA 必填 totp_code
 *   - 確認 → block ~15 秒(後端等 TRX top-up + 上鏈)→ 回 tx_hash
 */
export function FeeWithdrawButton() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "zh-TW";
  const [open, setOpen] = React.useState(false);
  const [quota, setQuota] = React.useState<OutboundQuota | null>(null);
  const [twofaEnabled, setTwofaEnabled] = React.useState(false);
  const [toAddress, setToAddress] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<FeeWithdrawResult | null>(null);

  async function openModal() {
    setOpen(true);
    setErr(null);
    setDone(null);
    try {
      const [q, t] = await Promise.all([fetchOutboundQuota(), fetchTwoFAStatus()]);
      setQuota(q);
      setTwofaEnabled(t.enabled);
      // 預設 amount = max
      setAmount(q.fee_withdrawal_max);
    } catch (e) {
      setErr((e as { code?: string }).code ?? "load_failed");
    }
  }

  async function submit() {
    setErr(null);
    if (!TRON_RE.test(toAddress.trim())) {
      setErr("地址格式錯誤(必須是 Tron 地址)");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setErr("金額必須大於 0");
      return;
    }
    if (twofaEnabled) {
      const stripped = totpCode.replace(/[-\s]/g, "");
      if (stripped.length !== 6 && stripped.length !== 8) {
        setErr("請輸入 6 位驗證碼或 8 位備用碼");
        return;
      }
    }
    setBusy(true);
    try {
      const r = await feeWithdraw({
        to_address: toAddress.trim(),
        amount,
        totp_code: twofaEnabled ? totpCode.trim() : undefined,
      });
      setDone(r);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "error";
      const params = (e as { params?: { max?: string; requested?: string } }).params;
      if (code === "platform.outbound.exceedsQuota" && params) {
        setErr(`金額超過可提額度(最多 ${params.max} USDT)`);
      } else if (code === "admin.twofaRequired") {
        setErr("必須先啟用兩步驟驗證");
        // 後端 412 → 拉回去重 fetch 一次,讓 UI 切到 CTA
        try {
          const t = await fetchTwoFAStatus();
          setTwofaEnabled(t.enabled);
        } catch {}
      } else if (code === "platform.outbound.twofaRequired") {
        setErr("請輸入兩步驟驗證碼");
      } else if (code === "twofa.invalidCode") {
        setErr("驗證碼錯誤,請重新輸入");
      } else {
        setErr(code);
      }
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setToAddress("");
    setAmount("");
    setTotpCode("");
    setErr(null);
    setDone(null);
  }

  return (
    <>
      <Button onClick={openModal} variant="outline" size="sm">
        <Coins className="h-4 w-4" />
        提領平台獲利
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">提領平台獲利</h2>
            <p className="mt-1 text-xs text-slate-500">
              把累計手續費從 HOT 提到外部地址。**永遠不能超過獲利金額**(系統強制保護用戶資金)。
            </p>

            {/* 沒開 2FA → 顯示去啟用的 CTA,disable 表單 */}
            {!done && quota !== null && !twofaEnabled ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" />
                  必須先啟用兩步驟驗證
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  動到平台資金的操作強制要求 2FA。請先到設定頁啟用,再回來提獲利。
                </p>
                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm">
                    <Link href={`/${locale}/settings`}>前往設定 →</Link>
                  </Button>
                  <Button onClick={close} variant="outline" size="sm">
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            {done ? (
              <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> 提領成功
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">金額</dt>
                    <dd className="font-mono">{done.amount} USDT</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-slate-500">收件地址</dt>
                    <dd className="break-all font-mono">{done.to_address}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-slate-500">tx hash</dt>
                    <dd className="break-all font-mono">{done.tx_hash}</dd>
                  </div>
                </dl>
                <Button onClick={close} className="mt-4 w-full">
                  關閉
                </Button>
              </div>
            ) : !twofaEnabled && quota !== null ? null : (
              <>
                {quota ? (
                  <div className="mt-3 rounded-md border border-cream-edge bg-paper/50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="text-slate-500">當前可提額度</p>
                    <p className="mt-1 font-mono text-base">
                      {quota.fee_withdrawal_max}{" "}
                      <span className="text-slate-500">USDT</span>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      = HOT {quota.hot_usdt_balance} − 在途提領 {quota.in_flight_withdrawal_amount} − 用戶餘額 {quota.user_balances_total}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <div>
                    <Label htmlFor="fw-to">收件地址</Label>
                    <Input
                      id="fw-to"
                      value={toAddress}
                      onChange={(e) => setToAddress(e.target.value)}
                      placeholder="T..."
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fw-amt">金額(USDT)</Label>
                    <Input
                      id="fw-amt"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      step="0.000001"
                    />
                    {quota ? (
                      <button
                        type="button"
                        onClick={() => setAmount(quota.fee_withdrawal_max)}
                        className="mt-1 text-xs text-brand hover:underline"
                      >
                        提全部({quota.fee_withdrawal_max} USDT)
                      </button>
                    ) : null}
                  </div>
                  {twofaEnabled ? (
                    <div>
                      <Label htmlFor="fw-totp">兩步驟驗證</Label>
                      <Input
                        id="fw-totp"
                        inputMode="numeric"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="6 位驗證碼或 8 位備用碼"
                        maxLength={20}
                        className="font-mono tracking-widest"
                      />
                    </div>
                  ) : null}
                </div>

                {err ? (
                  <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {err}
                  </p>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <Button onClick={close} variant="outline" disabled={busy}>
                    取消
                  </Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        處理中(~15 秒)
                      </>
                    ) : (
                      "確認送出"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
