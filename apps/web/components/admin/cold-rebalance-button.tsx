"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDownToLine, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  coldRebalance,
  fetchColdWallet,
  type ColdRebalanceResult,
  type ColdWalletInfo,
} from "@/lib/api/withdrawal";
import { fetchTwoFAStatus } from "@/lib/api/twofa";

/**
 * COLD rebalance — 從 HOT 移轉超額 USDT 到 COLD wallet。
 * 跟 FeeWithdrawButton 結構類似,但 amount 上限是 cold_rebalance_max,
 * 收件地址固定為 cold_wallet_address(使用者不能改)。
 */
export function ColdRebalanceButton() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "zh-TW";
  const [open, setOpen] = React.useState(false);
  const [info, setInfo] = React.useState<ColdWalletInfo | null>(null);
  const [twofaEnabled, setTwofaEnabled] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<ColdRebalanceResult | null>(null);

  async function openModal() {
    setOpen(true);
    setErr(null);
    setDone(null);
    try {
      const [c, t] = await Promise.all([fetchColdWallet(), fetchTwoFAStatus()]);
      setInfo(c);
      setTwofaEnabled(t.enabled);
      // 預設建議金額 = 移轉到 hot_target 的差額(但不超過 cold_rebalance_max)
      const suggest = Math.min(
        Number(c.over_max_amount) + (Number(c.hot_max_usdt) - Number(c.hot_target_usdt)),
        Number(c.cold_rebalance_max),
      );
      setAmount(suggest > 0 ? String(suggest) : c.cold_rebalance_max);
    } catch (e) {
      setErr((e as { code?: string }).code ?? "load_failed");
    }
  }

  function close() {
    setOpen(false);
    setAmount("");
    setTotpCode("");
    setErr(null);
    setDone(null);
  }

  async function submit() {
    setErr(null);
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
      const r = await coldRebalance({
        amount,
        totp_code: twofaEnabled ? totpCode.trim() : undefined,
      });
      setDone(r);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "error";
      const params = (e as { params?: { max?: string; requested?: string } }).params;
      if (code === "platform.outbound.exceedsQuota" && params) {
        setErr(`金額超過上限(最多 ${params.max} USDT — 不能動到用戶資金)`);
      } else if (code === "platform.cold.notConfigured") {
        setErr("COLD_WALLET_ADDRESS 未設定,請先在 .env 設定");
      } else if (code === "admin.twofaRequired") {
        setErr("必須先啟用兩步驟驗證");
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

  return (
    <>
      <Button onClick={openModal} variant="outline" size="sm">
        <ArrowDownToLine className="h-4 w-4" />
        移轉到 COLD
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">把 HOT 超額移到 COLD</h2>
            <p className="mt-1 text-xs text-slate-500">
              系統強制保護:不能動到用戶資金,額度只到平台獲利為止。
            </p>

            {done ? (
              <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> 移轉成功
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">金額</dt>
                    <dd className="font-mono">{done.amount} USDT</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-slate-500">收件 (COLD)</dt>
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
            ) : info && info.address === null ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" /> 未設定 COLD 地址
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  請在 <code>.env</code> 設定 <code>COLD_WALLET_ADDRESS</code>(你掌控的 Tron 地址,例如 TronLink / 硬體錢包),然後重啟 api。
                </p>
                <Button onClick={close} variant="outline" className="mt-3">
                  知道了
                </Button>
              </div>
            ) : info && !twofaEnabled ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" /> 必須先啟用 2FA
                </p>
                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm">
                    <Link href={`/${locale}/settings`}>前往設定 →</Link>
                  </Button>
                  <Button onClick={close} variant="outline" size="sm">取消</Button>
                </div>
              </div>
            ) : info && Number(info.cold_rebalance_max) === 0 ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" /> 目前無可移額度
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  雖然 HOT 已達 {info.hot_max_usdt} USDT 上限(目前超出 {info.over_max_amount} USDT),
                  但**平台累積獲利為 0**(或在途提領吃掉了)。系統不會動到用戶資金。
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  解法:等用戶完成幾筆提領累積手續費,或由運營者主動把 HOT 多餘部分移到 COLD(若你願意承擔「萬一用戶提領大量時 HOT 不夠要從 COLD 撥回」的責任,需手動操作不走此 endpoint)。
                </p>
                <Button onClick={close} variant="outline" className="mt-3">
                  知道了
                </Button>
              </div>
            ) : info ? (
              <>
                <div className="mt-3 rounded-md border border-cream-edge bg-paper/50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-slate-500">可移額度(系統強制 ≤ 平台獲利)</p>
                  <p className="mt-1 font-mono text-base">
                    {info.cold_rebalance_max}{" "}
                    <span className="text-slate-500">USDT</span>
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    HOT 上限 {info.hot_max_usdt} / 目標水位 {info.hot_target_usdt}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <Label>收件 COLD 地址(系統 .env 設定,不可改)</Label>
                    <p className="mt-1 break-all rounded-md border border-cream-edge bg-paper px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900">
                      {info.address}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="cr-amt">金額(USDT)</Label>
                    <Input
                      id="cr-amt"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      step="0.000001"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(info.cold_rebalance_max)}
                      className="mt-1 text-xs text-brand hover:underline"
                    >
                      移全部({info.cold_rebalance_max} USDT)
                    </button>
                  </div>
                  {twofaEnabled ? (
                    <div>
                      <Label htmlFor="cr-totp">兩步驟驗證</Label>
                      <Input
                        id="cr-totp"
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
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> 載入中
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
