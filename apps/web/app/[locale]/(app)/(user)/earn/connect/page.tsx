import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import { fetchEarnMeServer } from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectBitfinexForm } from "@/components/earn/connect-bitfinex-form";

export default async function EarnConnectPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const earn = await fetchEarnMeServer(cookieHeader);
  if (!earn) {
    redirect(`/${locale}/earn`);
  }

  // Already connected → bounce back to /earn
  if (earn.bitfinex_connected) {
    redirect(`/${locale}/earn`);
  }

  // KYC not approved → block
  if (earn.kyc_status !== "APPROVED") {
    redirect(`/${locale}/earn`);
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-6 py-6">
      <Link
        href={`/${locale}/earn`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> 回 Earn
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">連接 Bitfinex</h1>
        <p className="mt-1 text-sm text-slate-500">
          提供你的 Bitfinex API key + Funding wallet TRC20 入金地址。Quiver 會驗證這個 key 能讀到你 funding wallet 餘額才會儲存。
        </p>
      </div>

      <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader className="flex-row items-start gap-3">
          <BookOpen className="h-5 w-5 flex-none text-amber-600" />
          <div className="flex-1">
            <CardTitle className="text-base">第一次設定?先看完整教學</CardTitle>
            <CardDescription>
              教學包含:Bitfinex 怎麼開 API key、權限要勾哪些 / 不能勾哪些(尤其 Withdrawal 永遠不要開)、IP allowlist 設定、入金地址在哪裡找。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${locale}/earn/setup-guide`}
            className="text-sm font-medium text-brand hover:underline"
          >
            開啟教學頁面 →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Key + 入金地址</CardTitle>
          <CardDescription>
            送出後 Quiver 會立刻 call Bitfinex 驗證 key 通過才存。Key 跟 secret 用 AES-GCM + KEK 加密(跟錢包私鑰同等級保護)。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectBitfinexForm locale={locale} />
        </CardContent>
      </Card>

      {/* Permission cheat-sheet (mobile-friendly summary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">快速 checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div>
            <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">✅ 要打開</div>
            <ul className="ml-4 space-y-0.5 text-slate-600 dark:text-slate-400">
              <li>Wallets → Get wallet balances and addresses</li>
              <li>Margin Funding → Get funding statuses and info</li>
              <li>
                <strong>Margin Funding → Offer, cancel and close funding</strong>
              </li>
              <li>Account Info / History / Orders / Margin / Settings(read 類)</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-red-700 dark:text-red-400">❌ 絕對不要打開</div>
            <ul className="ml-4 space-y-0.5 text-slate-600 dark:text-slate-400">
              <li>
                <strong>Withdrawals → Create a new withdrawal</strong>(被偷錢的最大入口)
              </li>
              <li>Wallets → Transfer between your wallets</li>
              <li>Orders → Create and cancel orders</li>
              <li>Margin Trading → Claim a position</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-sky-700 dark:text-sky-400">📌 IP allowlist</div>
            <code className="ml-4 inline-block rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
              45.77.30.174
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
