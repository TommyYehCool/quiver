"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectBitfinex } from "@/lib/api/earn-user";

const TRON_ADDR_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

type Locale = "zh-TW" | "en" | "ja";
const STRINGS: Record<Locale, {
  apiKeyLabel: string;
  apiSecretLabel: string;
  apiSecretHelp: string;
  fundingAddrLabel: string;
  fundingAddrHelpBefore: string;
  fundingAddrHelpStrong: string;
  fundingAddrHelpAfter: string;
  fundingAddrInvalid: string;
  referralCodeLabel: string;
  referralCodeHelp: string;
  referralBindOk: string;
  successPrefix: string;
  errVerifyPrefix: string;
  errVerifyDefault: string;
  errKycRequired: string;
  errGeneric: string;
  busyLabel: string;
  submitLabel: string;
}> = {
  "zh-TW": {
    apiKeyLabel: "Bitfinex API Key",
    apiSecretLabel: "Bitfinex API Secret",
    apiSecretHelp: "Secret 只用 password input 顯示。送出後立刻 AES-GCM 加密儲存。",
    fundingAddrLabel: "Bitfinex Funding wallet — TRC20 USDT 入金地址",
    fundingAddrHelpBefore:
      "在 Bitfinex 點 Wallets → Deposit → Tether (USDt) → Network: Tron (TRX) → 複製 ",
    fundingAddrHelpStrong: "Funding wallet address",
    fundingAddrHelpAfter: "(不是 Exchange / Margin)。",
    fundingAddrInvalid: "⚠ 格式不對(34 字元 T 開頭)",
    referralCodeLabel: "推薦碼(可選)",
    referralCodeHelp: "如果朋友邀你來,輸入他們的推薦碼。連接後仍可在「推薦」頁面綁定。",
    referralBindOk: "✓ 推薦碼綁定成功",
    successPrefix: "連接成功!Bitfinex Funding wallet 餘額:",
    errVerifyPrefix: "Bitfinex 驗證失敗:",
    errVerifyDefault: "請檢查 key + secret 是否正確,以及 IP allowlist 是否設了 45.77.30.174",
    errKycRequired: "請先完成 KYC 驗證",
    errGeneric: "操作失敗",
    busyLabel: "驗證 Bitfinex 中...",
    submitLabel: "連接 Bitfinex",
  },
  en: {
    apiKeyLabel: "Bitfinex API Key",
    apiSecretLabel: "Bitfinex API Secret",
    apiSecretHelp: "Secret is shown as a password field. On submit it's immediately encrypted with AES-GCM.",
    fundingAddrLabel: "Bitfinex Funding wallet — TRC20 USDT deposit address",
    fundingAddrHelpBefore:
      "In Bitfinex go to Wallets → Deposit → Tether (USDt) → Network: Tron (TRX), then copy the ",
    fundingAddrHelpStrong: "Funding wallet address",
    fundingAddrHelpAfter: " (not Exchange / Margin).",
    fundingAddrInvalid: "⚠ Wrong format (must be 34 chars starting with T)",
    referralCodeLabel: "Referral code (optional)",
    referralCodeHelp: "If a friend invited you, paste their code. You can also bind one later from the Referral page.",
    referralBindOk: "✓ Referral code bound",
    successPrefix: "Connected! Bitfinex Funding wallet balance: ",
    errVerifyPrefix: "Bitfinex verification failed: ",
    errVerifyDefault:
      "Please check the key + secret are correct, and that 45.77.30.174 is in your IP allowlist.",
    errKycRequired: "Please complete KYC first.",
    errGeneric: "Operation failed",
    busyLabel: "Verifying Bitfinex...",
    submitLabel: "Connect Bitfinex",
  },
  ja: {
    apiKeyLabel: "Bitfinex API キー",
    apiSecretLabel: "Bitfinex API シークレット",
    apiSecretHelp: "シークレットはパスワード入力で表示されます。送信時に即座に AES-GCM で暗号化されます。",
    fundingAddrLabel: "Bitfinex Funding ウォレット — TRC20 USDT 入金アドレス",
    fundingAddrHelpBefore:
      "Bitfinex で Wallets → Deposit → Tether (USDt) → Network: Tron (TRX) を開き、",
    fundingAddrHelpStrong: "Funding ウォレットアドレス",
    fundingAddrHelpAfter: " をコピー(Exchange / Margin ではなく)。",
    fundingAddrInvalid: "⚠ 形式が無効(T で始まる 34 文字)",
    referralCodeLabel: "リファラルコード(任意)",
    referralCodeHelp: "友達に招待された場合、コードを入力してください。後からリファラルページでも紐付けできます。",
    referralBindOk: "✓ リファラルコード紐付け済み",
    successPrefix: "接続成功!Bitfinex Funding ウォレット残高:",
    errVerifyPrefix: "Bitfinex 検証失敗:",
    errVerifyDefault:
      "キーとシークレットが正しいか、IP allowlist に 45.77.30.174 が登録されているかご確認ください。",
    errKycRequired: "先に本人確認を完了してください。",
    errGeneric: "操作失敗",
    busyLabel: "Bitfinex を検証中...",
    submitLabel: "Bitfinex を接続",
  },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export function ConnectBitfinexForm({ locale }: { locale: string }) {
  const router = useRouter();
  const s = STRINGS[pickLocale(useLocale())];
  const [apiKey, setApiKey] = React.useState("");
  const [apiSecret, setApiSecret] = React.useState("");
  const [fundingAddr, setFundingAddr] = React.useState("");
  const [referralCode, setReferralCode] = React.useState("");
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
        referral_code: referralCode.trim() || undefined,
      });
      const bindNote =
        r.referral_bind_status === "ok" ? `\n${s.referralBindOk}` : "";
      setSuccess(`${s.successPrefix}${r.bitfinex_funding_balance} USDT${bindNote}`);
      setTimeout(() => router.push(`/${locale}/earn`), 1800);
    } catch (e) {
      const code = (e as { code?: string }).code ?? s.errGeneric;
      const params = (e as { params?: Record<string, unknown> }).params ?? {};
      setErr(
        code === "earn.bitfinexVerifyFailed"
          ? `${s.errVerifyPrefix}${(params as { error?: string }).error ?? s.errVerifyDefault}`
          : code === "earn.kycRequired"
          ? s.errKycRequired
          : `${code}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api_key">{s.apiKeyLabel}</Label>
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
        <Label htmlFor="api_secret">{s.apiSecretLabel}</Label>
        <Input
          id="api_secret"
          type="password"
          autoComplete="off"
          placeholder="●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          disabled={busy}
        />
        <p className="text-xs text-slate-500">{s.apiSecretHelp}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="funding_addr">{s.fundingAddrLabel}</Label>
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
          {s.fundingAddrHelpBefore}
          <strong>{s.fundingAddrHelpStrong}</strong>
          {s.fundingAddrHelpAfter}
          {fundingAddr && !fundingAddrValid && (
            <span className="ml-1 text-red-500">{s.fundingAddrInvalid}</span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="referral_code">{s.referralCodeLabel}</Label>
        <Input
          id="referral_code"
          type="text"
          autoComplete="off"
          placeholder="ALICE12"
          maxLength={12}
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          disabled={busy}
          className="font-mono uppercase tracking-widest"
        />
        <p className="text-xs text-slate-500">{s.referralCodeHelp}</p>
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
            {s.busyLabel}
          </>
        ) : (
          s.submitLabel
        )}
      </Button>
    </form>
  );
}
