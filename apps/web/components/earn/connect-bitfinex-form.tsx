"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectBitfinex } from "@/lib/api/earn-user";

const TRON_ADDR_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function ConnectBitfinexForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [apiKey, setApiKey] = React.useState("");
  const [apiSecret, setApiSecret] = React.useState("");
  const [fundingAddr, setFundingAddr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const fundingAddrValid = TRON_ADDR_RE.test(fundingAddr);
  const canSubmit =
    !busy &&
    apiKey.trim().length >= 20 &&
    apiSecret.trim().length >= 20 &&
    fundingAddrValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const r = await connectBitfinex({
        bitfinex_api_key: apiKey.trim(),
        bitfinex_api_secret: apiSecret.trim(),
        bitfinex_funding_address: fundingAddr.trim(),
      });
      setSuccess(
        `連接成功!Bitfinex Funding wallet 餘額:${r.bitfinex_funding_balance} USDT`,
      );
      // Bounce to /earn after a short pause for the user to see success
      setTimeout(() => router.push(`/${locale}/earn`), 1800);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "操作失敗";
      const params = (e as { params?: Record<string, unknown> }).params ?? {};
      setErr(
        code === "earn.bitfinexVerifyFailed"
          ? `Bitfinex 驗證失敗:${(params as { error?: string }).error ?? "請檢查 key + secret 是否正確,以及 IP allowlist 是否設了 45.77.30.174"}`
          : code === "earn.kycRequired"
          ? "請先完成 KYC 驗證"
          : `${code}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api_key">Bitfinex API Key</Label>
        <Input
          id="api_key"
          type="text"
          autoComplete="off"
          placeholder="t-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="api_secret">Bitfinex API Secret</Label>
        <Input
          id="api_secret"
          type="password"
          autoComplete="off"
          placeholder="●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          disabled={busy}
        />
        <p className="text-xs text-slate-500">
          Secret 只用 password input 顯示。送出後立刻 AES-GCM 加密儲存。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="funding_addr">
          Bitfinex Funding wallet — TRC20 USDT 入金地址
        </Label>
        <Input
          id="funding_addr"
          type="text"
          autoComplete="off"
          placeholder="T..."
          value={fundingAddr}
          onChange={(e) => setFundingAddr(e.target.value)}
          disabled={busy}
        />
        <p className="text-xs text-slate-500">
          在 Bitfinex 點 Wallets → Deposit → Tether (USDt) → Network: Tron (TRX) → 複製{" "}
          <strong>Funding wallet address</strong>(不是 Exchange / Margin)。
          {fundingAddr && !fundingAddrValid && (
            <span className="ml-1 text-red-500">⚠ 格式不對(34 字元 T 開頭)</span>
          )}
        </p>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            驗證 Bitfinex 中...
          </>
        ) : (
          "連接 Bitfinex"
        )}
      </Button>
    </form>
  );
}
