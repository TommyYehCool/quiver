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

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<Locale, {
  back: string;
  title: string;
  subtitle: string;
  guideCard: { title: string; desc: string; cta: string };
  formCard: { title: string; desc: string };
  checklist: {
    title: string;
    yes: string;
    yesItems: string[];
    yesEmphasized: string;
    no: string;
    noItems: string[];
    noEmphasized: string;
    noEmphasizedSuffix: string;
    ipLabel: string;
  };
}> = {
  "zh-TW": {
    back: "回 Earn",
    title: "連接 Bitfinex",
    subtitle: "提供你的 Bitfinex API key + Funding wallet TRC20 入金地址。Quiver 會驗證這個 key 能讀到你 funding wallet 餘額才會儲存。",
    guideCard: {
      title: "第一次設定?先看完整教學",
      desc: "教學包含:Bitfinex 怎麼開 API key、權限要勾哪些 / 不能勾哪些(尤其 Withdrawal 永遠不要開)、IP allowlist 設定、入金地址在哪裡找。",
      cta: "開啟教學頁面 →",
    },
    formCard: {
      title: "API Key + 入金地址",
      desc: "送出後 Quiver 會立刻 call Bitfinex 驗證 key 通過才存。Key 跟 secret 用 AES-GCM + KEK 加密(跟錢包私鑰同等級保護)。",
    },
    checklist: {
      title: "快速 checklist",
      yes: "✅ 要打開",
      yesItems: [
        "Wallets → Get wallet balances and addresses",
        "Margin Funding → Get funding statuses and info",
        "Account Info / History / Orders / Margin / Settings(read 類)",
      ],
      yesEmphasized: "Margin Funding → Offer, cancel and close funding",
      no: "❌ 絕對不要打開",
      noItems: [
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
      ],
      noEmphasized: "Withdrawals → Create a new withdrawal",
      noEmphasizedSuffix: "(被偷錢的最大入口)",
      ipLabel: "📌 IP allowlist",
    },
  },
  en: {
    back: "Back to Earn",
    title: "Connect Bitfinex",
    subtitle: "Provide your Bitfinex API key + Funding wallet TRC20 deposit address. Quiver verifies the key by reading your funding balance before storing.",
    guideCard: {
      title: "First time? Read the full guide",
      desc: "The guide covers: how to create the API key, which permissions to enable / never enable (especially Withdrawal — never), IP allowlist setup, and where to find the deposit address.",
      cta: "Open setup guide →",
    },
    formCard: {
      title: "API Key + Deposit Address",
      desc: "On submit, Quiver immediately calls Bitfinex to verify the key works before storing. Key + secret are encrypted with AES-GCM + KEK (same protection as wallet private keys).",
    },
    checklist: {
      title: "Quick checklist",
      yes: "✅ Enable",
      yesItems: [
        "Wallets → Get wallet balances and addresses",
        "Margin Funding → Get funding statuses and info",
        "Account Info / History / Orders / Margin / Settings (read-only)",
      ],
      yesEmphasized: "Margin Funding → Offer, cancel and close funding",
      no: "❌ Never enable",
      noItems: [
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
      ],
      noEmphasized: "Withdrawals → Create a new withdrawal",
      noEmphasizedSuffix: " (the #1 attack vector)",
      ipLabel: "📌 IP allowlist",
    },
  },
  ja: {
    back: "Earn に戻る",
    title: "Bitfinex を接続",
    subtitle: "Bitfinex API キー + Funding ウォレットの TRC20 入金アドレスを提供してください。Quiver はキーが funding 残高を読み取れることを確認してから保存します。",
    guideCard: {
      title: "初めての設定?先にガイドを読む",
      desc: "ガイドの内容:API キーの作成方法、有効にする / 絶対に有効にしない権限(特に Withdrawal は絶対に有効にしない)、IP allowlist の設定、入金アドレスの場所。",
      cta: "セットアップガイドを開く →",
    },
    formCard: {
      title: "API キー + 入金アドレス",
      desc: "送信後、Quiver が即座に Bitfinex を呼び出してキーを検証してから保存します。キーとシークレットは AES-GCM + KEK で暗号化(ウォレット秘密鍵と同等の保護)。",
    },
    checklist: {
      title: "クイックチェックリスト",
      yes: "✅ 有効にする",
      yesItems: [
        "Wallets → Get wallet balances and addresses",
        "Margin Funding → Get funding statuses and info",
        "Account Info / History / Orders / Margin / Settings(read 系)",
      ],
      yesEmphasized: "Margin Funding → Offer, cancel and close funding",
      no: "❌ 絶対に有効にしない",
      noItems: [
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
      ],
      noEmphasized: "Withdrawals → Create a new withdrawal",
      noEmphasizedSuffix: "(資金窃取の最大入口)",
      ipLabel: "📌 IP allowlist",
    },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

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
  if (earn.bitfinex_connected) {
    redirect(`/${locale}/earn`);
  }
  if (earn.kyc_status !== "APPROVED") {
    redirect(`/${locale}/earn`);
  }

  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-2xl space-y-6 py-6">
      <Link
        href={`/${locale}/earn`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
      </div>

      <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader className="flex-row items-start gap-3">
          <BookOpen className="h-5 w-5 flex-none text-amber-600" />
          <div className="flex-1">
            <CardTitle className="text-base">{s.guideCard.title}</CardTitle>
            <CardDescription>{s.guideCard.desc}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${locale}/earn/setup-guide`}
            className="text-sm font-medium text-brand hover:underline"
          >
            {s.guideCard.cta}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{s.formCard.title}</CardTitle>
          <CardDescription>{s.formCard.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectBitfinexForm locale={locale} />
        </CardContent>
      </Card>

      {/* Permission cheat-sheet (mobile-friendly summary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.checklist.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div>
            <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">{s.checklist.yes}</div>
            <ul className="ml-4 space-y-0.5 text-slate-600 dark:text-slate-400">
              <li>
                <strong>{s.checklist.yesEmphasized}</strong>
              </li>
              {s.checklist.yesItems.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-red-700 dark:text-red-400">{s.checklist.no}</div>
            <ul className="ml-4 space-y-0.5 text-slate-600 dark:text-slate-400">
              <li>
                <strong>{s.checklist.noEmphasized}</strong>{s.checklist.noEmphasizedSuffix}
              </li>
              {s.checklist.noItems.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-sky-700 dark:text-sky-400">{s.checklist.ipLabel}</div>
            <code className="ml-4 inline-block rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
              45.77.30.174
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
