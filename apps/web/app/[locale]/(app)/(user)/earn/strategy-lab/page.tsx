import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import { fetchEarnMeServer } from "@/lib/api/earn-user-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StrategyPreviewCard } from "@/components/earn/strategy-preview-card";

/**
 * /earn/strategy-lab — F-5a-3.10.3 standalone home for the smart-strategy
 * what-if explorer. Lifted out of /earn (where it competed with live state
 * for attention) so users can experiment with preset/amount combinations
 * without scrolling past their actual positions.
 *
 * Visible only to users with an earn account + Bitfinex connection — without
 * the connection the underlying /strategy-preview endpoint can't compute
 * deployable amount, so we redirect back to /earn for setup.
 */

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<Locale, {
  back: string;
  title: string;
  subtitle: string;
  needSetupTitle: string;
  needSetupDesc: string;
  goSetup: string;
  about: { title: string; body: string };
}> = {
  "zh-TW": {
    back: "返回 Earn",
    title: "策略實驗室",
    subtitle: "試算智慧選擇器在不同金額下的決策。預覽不會實際下單。",
    needSetupTitle: "尚未連接 Bitfinex",
    needSetupDesc: "先到 Earn 完成 Bitfinex 連接，才能用實際資金做策略試算。",
    goSetup: "前往設定",
    about: {
      title: "這個頁面在做什麼？",
      body: "智慧選擇器會在 auto-lend 觸發時，根據即時市場信號(各期間中位數利率 + 30 分鐘成交量 + FRR)自動算出最佳的 (利率, 期間, 金額) 組合，而不是用單一固定的 FRR 利率掛單。\n這個頁面是它的 dry-run 預覽，你可以改金額，\n看它在當下會怎麼決定。沒有任何實際下單行為。",
    },
  },
  en: {
    back: "Back to Earn",
    title: "Strategy lab",
    subtitle: "Dry-run the smart selector across presets and amounts. Preview only — no orders submitted.",
    needSetupTitle: "Bitfinex not connected",
    needSetupDesc: "Complete the Bitfinex setup on the Earn page first, then come back to explore strategies with real deployable capital.",
    goSetup: "Go to setup",
    about: {
      title: "What is this page for?",
      body: "When auto-lend fires, the smart selector reads live market signals (per-period median rate + 30-min volume + FRR) and computes the best (rate, period, amount) tranches — instead of posting at a single FRR rate. This page is its dry-run preview: change preset or amount to see what it would decide right now. Nothing is actually submitted.",
    },
  },
  ja: {
    back: "Earn に戻る",
    title: "戦略ラボ",
    subtitle: "スマートセレクターを preset / 金額別にドライラン試算。プレビューのみ、注文は出ません。",
    needSetupTitle: "Bitfinex 未接続",
    needSetupDesc: "Earn ページで Bitfinex 接続を完了してから、実資金での戦略試算をお試しください。",
    goSetup: "設定へ",
    about: {
      title: "このページの目的",
      body: "auto-lend 実行時、スマートセレクターはリアルタイムの市場シグナル(期間別中央値利率 + 30 分間出来高 + FRR)から最適な (利率、期間、金額) の組み合わせを自動算出します(単一 FRR 利率での掲示ではなく)。このページはそのドライランプレビュー — preset・金額を変えて現時点での判断を確認できます。実際の発注は行われません。",
    },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export default async function StrategyLabPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = pickLocale(rawLocale);
  const s = STRINGS[locale];

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const me = await fetchMeServer(cookieHeader);
  if (!me) {
    redirect(`/${locale}/login?next=/${locale}/earn/strategy-lab`);
  }
  const earn = await fetchEarnMeServer(cookieHeader);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Back link */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/earn`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {s.back}
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <p className="text-sm text-slate-500">{s.subtitle}</p>
      </div>

      {/* Setup gate */}
      {!earn || !earn.has_earn_account || !earn.bitfinex_connected ? (
        <Card>
          <CardHeader>
            <CardTitle>{s.needSetupTitle}</CardTitle>
            <CardDescription>{s.needSetupDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/${locale}/earn`}>{s.goSetup}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <StrategyPreviewCard initialPreset={earn.strategy_preset ?? "balanced"} />
          {/* About — quick context for first-time visitors */}
          <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
            <CardHeader>
              <CardTitle className="text-base">{s.about.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 dark:text-slate-400">
              {s.about.body}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
