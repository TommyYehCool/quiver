import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Coins, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { fetchFeePayerServer } from "@/lib/api/withdrawal-server";

export default async function AdminPlatformPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const fp = await fetchFeePayerServer(cookieHeader);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/dashboard`} className="text-sm text-slate-500 hover:underline">
          ← 回首頁
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">平台帳戶</h1>
        <p className="mt-1 text-sm text-slate-500">
          檢視平台地址 + 餘額。FEE_PAYER 用來代付提領上鏈的 TRX gas 費。
        </p>
      </div>

      <Card className="bg-macaron-lavender dark:bg-slate-900">
        <CardHeader className="flex-row items-start gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-lavender">
            <Wallet className="h-6 w-6 text-violet-700" />
          </span>
          <div className="flex-1">
            <CardTitle>FEE_PAYER(代付 TRX gas)</CardTitle>
            <CardDescription>
              派生自 master seed,路徑 m/44&apos;/195&apos;/1&apos;/0/0
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fp === null ? (
            <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              無法載入 — 系統可能未初始化或 KEK 不對
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">地址 ({fp.network})</p>
                <p className="mt-1 break-all rounded-lg border border-cream-edge bg-paper px-3 py-2 font-mono text-sm text-slate-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {fp.address}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
                  <Coins className="h-3.5 w-3.5" /> TRX 餘額
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {fp.trx_balance}{" "}
                  <span className="text-sm font-normal text-slate-500">TRX</span>
                </p>
                {fp.low_balance_warning ? (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p>
                      餘額低於 100 TRX。Phase 5C 會在低於閾值時自動阻擋新提領。請從
                      Shasta faucet 補充:
                      <a
                        href="https://shasta.tronex.io/"
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 underline"
                      >
                        shasta.tronex.io
                      </a>
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-cream-edge bg-paper/50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                <p className="font-medium text-slate-600 dark:text-slate-300">如何充 TRX</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>Testnet:從 Shasta faucet 把 TRX 送到上面這個地址</li>
                  <li>
                    Mainnet:在 deploy 前手動從 cold wallet 轉一筆 TRX 過來,建議至少 1000 TRX
                    以上
                  </li>
                  <li>Phase 5B worker 廣播提領時會自動拿這個帳戶的 TRX 付 gas</li>
                </ol>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
