import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Earn setup guide — static page based on docs/earn-bitfinex-api-key-setup.md.
 * We render the content inline (rather than fetching markdown at runtime) so it
 * works on mobile without bundling a markdown lib for one page. If/when this
 * grows, swap to react-markdown.
 */
export default function SetupGuidePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href={`/${locale}/earn/connect`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> 回到連接頁面
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Bitfinex API Key 設定教學
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          5 分鐘設好,讓 Quiver 自動幫你在 Bitfinex 放貸賺利息。
          你的錢始終在你自己 Bitfinex 帳號裡(Quiver 沒有提現權限)。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟一:登入 Bitfinex 開新 API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            登入{" "}
            <a
              href="https://setting.bitfinex.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              setting.bitfinex.com/api
            </a>
            ,點 <strong>Create New API Key</strong>。
          </p>
          <p>Label 建議:<code className="rounded bg-slate-100 px-1 dark:bg-slate-800">quiver-earn</code></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟二:勾選權限</CardTitle>
          <CardDescription>看清楚,勾錯會出問題</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">✅ 要打開的</div>
            <ul className="ml-4 list-disc space-y-0.5 text-slate-700 dark:text-slate-300">
              <li>Account Info → Get account fee information</li>
              <li>Account History → Get historical balances entries and trade information</li>
              <li>Orders → Get orders and statuses</li>
              <li>Margin Trading → Get position and margin info</li>
              <li><strong>Margin Funding → Get funding statuses and info</strong> ⭐</li>
              <li><strong>Margin Funding → Offer, cancel and close funding</strong> ⭐(核心)</li>
              <li><strong>Wallets → Get wallet balances and addresses</strong> ⭐</li>
              <li>Settings → Read account settings</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-red-700 dark:text-red-400">❌ 絕對不要打開</div>
            <ul className="ml-4 list-disc space-y-0.5 text-slate-700 dark:text-slate-300">
              <li><strong>Withdrawals → Create a new withdrawal</strong>(被偷錢的最大入口,任何時候都不要開)</li>
              <li>Wallets → Transfer between your wallets</li>
              <li>Orders → Create and cancel orders</li>
              <li>Margin Trading → Claim a position</li>
              <li>Edit account information / Write account settings</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟三:IP Allowlist(必做)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>找到 「IP Access restrictions」,確保 <strong>「Allow access from any IP」維持 OFF</strong>,然後在框框填入:</p>
          <div className="rounded bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-slate-800">
            45.77.30.174
          </div>
          <p className="text-xs text-slate-500">這是 Quiver prod server IP。萬一 key 外洩,從別的 IP 也用不了。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟四:Generate + 複製 key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>輸入 2FA 後 Generate Key。Bitfinex 會給你 API Key + Secret(Secret 只顯示一次,複製好)。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟五:複製 Funding wallet 入金地址</CardTitle>
          <CardDescription>Quiver 需要這個地址才能把你的 USDT 送過去</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="ml-4 list-decimal space-y-1 text-slate-700 dark:text-slate-300">
            <li>Bitfinex → Wallets → Deposit</li>
            <li>選 Tether (USDt)</li>
            <li>Network 選 Tron (TRX)</li>
            <li>會看到三個地址(Exchange / Margin / Funding)</li>
            <li><strong>只複製 Funding wallet address</strong>(不是 Exchange,不是 Margin)</li>
          </ol>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ⚠ 複製錯地址會讓錢卡在錯的 wallet,要 Funding 才能放貸
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">步驟六:回 Quiver 連接</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            把 API key + Secret + Funding 入金地址貼進{" "}
            <Link href={`/${locale}/earn/connect`} className="text-brand hover:underline">
              /earn/connect
            </Link>{" "}
            的表單。Quiver 會立刻 call Bitfinex 驗證 key 通過才存。
          </p>
        </CardContent>
      </Card>

      <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-base">FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium">Q. 我可以隨時撤銷 Quiver 的權限嗎?</div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              可以。任何時候到 setting.bitfinex.com/api 點 Revoke 那把 key,Quiver 立刻無法再操作。你 Bitfinex 上的部位完全不受影響。
            </p>
          </div>
          <div>
            <div className="font-medium">Q. 萬一 key 被偷會怎樣?</div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              攻擊者不能提走你的錢(沒 Withdrawal 權限),最多能幫你掛/取消 funding offer。加上 IP allowlist,攻擊者必須先攻陷 Quiver server 才能用這把 key。
            </p>
          </div>
          <div>
            <div className="font-medium">Q. 我可以隨時把錢從 Bitfinex 提走嗎?</div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              可以,100% 在你控制。先在 Bitfinex 取消 active funding offer 或等到期,再從 Bitfinex 提到任何錢包。Quiver 沒有提現權限,提錢始終是你自己操作。
            </p>
          </div>
          <div>
            <div className="font-medium">Q. Bitfinex KYC 沒過可以用嗎?</div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Bitfinex Funding 一般要 Intermediate KYC 以上才能用。先在 Bitfinex 完成 KYC 再來。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link href={`/${locale}/earn/connect`}>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
            開始連接 Bitfinex →
          </button>
        </Link>
      </div>
    </div>
  );
}
