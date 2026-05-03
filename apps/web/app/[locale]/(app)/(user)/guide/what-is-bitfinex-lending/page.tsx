import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Locale = "zh-TW" | "en" | "ja";

interface Strings {
  back: string;
  title: string;
  subtitle: string;
  s1: { h: string; body: string };
  s2: { h: string; lead: string; steps: string[]; tail: string };
  s3: { h: string; lead: string; rows: { period: string; rate: string; apy: string }[]; note: string };
  s4: { h: string; items: { name: string; pro: string; con: string }[] };
  s5: { h: string; items: string[] };
  s6: { h: string; body: string };
  ctaPrimary: string;
  ctaSecondary: string;
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    back: "回教學首頁",
    title: "① 何謂 Bitfinex 放貸?",
    subtitle: "Bitfinex Funding 是把你閒置的 USDT 借給做槓桿的交易者,他們付你利息。完全不用懂技術,5 分鐘看完就懂。",

    s1: {
      h: "為什麼有人要借 USDT?",
      body: "Bitfinex 是個能做槓桿(margin)的交易所。交易者要做 5 倍多單,自己只有 2,000 USDT,就要借 8,000 USDT 來開倉。借這 8,000 的人就是「funding lender」— 也就是你。交易者付的利息扣掉 Bitfinex 抽成 15%,剩下都是你的。",
    },

    s2: {
      h: "你的 USDT 在這個流程裡走到哪?",
      lead: "從你 Quiver 餘額開始算:",
      steps: [
        "你存 USDT 進 Quiver(或 Quiver 內部轉帳收到)",
        "Quiver 自動把 USDT 從你的 Quiver 餘額送到你 Bitfinex Funding 錢包",
        "Quiver 在 Bitfinex 上掛 funding offer(例如「我借出 1,000 USDT,2 天,日利率 0.03%」)",
        "想做槓桿的交易者「接走」你的 offer,你的 USDT 就借出去了",
        "到期那刻,Bitfinex 自動把本金 + 利息退回你的 Funding 錢包",
        "Quiver 看到錢回來,自動再掛新 offer 賺下一輪",
      ],
      tail: "整個過程錢始終在你自己 Bitfinex 帳戶 — Quiver 沒有提現權限。Bitfinex 上的部位你隨時可自己取消、自己提走。",
    },

    s3: {
      h: "實際能賺多少?",
      lead: "依市場波動,Bitfinex Funding USDT 近年常見利率區間大致如下(僅供參考,非保證):",
      rows: [
        { period: "Bear / 平靜期", rate: "0.005-0.015% / 日", apy: "1.8-5.5% APY" },
        { period: "正常市場", rate: "0.02-0.04% / 日", apy: "7-15% APY" },
        { period: "Bull market / 高需求", rate: "0.05-0.15% / 日", apy: "18-50% APY" },
      ],
      note: "Quiver 從你實際拿到的利息抽 perf fee(Friend 等級 5% / Public 15% / 訂閱 0%),本金完全不抽。",
    },

    s4: {
      h: "和其他選擇比較",
      items: [
        {
          name: "傳統銀行定存",
          pro: "極穩、有存款保險",
          con: "1-2% APY,實際被通膨吃光",
        },
        {
          name: "DeFi(Aave、Compound)",
          pro: "完全鏈上透明、隨時可提",
          con: "智能合約風險(history 上多次有 bug 被掏)、通常 APY 較低 3-5%",
        },
        {
          name: "中心化 Earn(Binance Earn 等)",
          pro: "APY 中等(5-12%)",
          con: "錢必須交給平台 — Celsius / FTX 倒了用戶就回不來",
        },
        {
          name: "Bitfinex Funding(這個)",
          pro: "錢在你自己帳戶 / APY 隨市場上限可達 15-30%+",
          con: "Bitfinex 倒了會有風險(雖然 2016 年被駭後有完整賠付過用戶)",
        },
      ],
    },

    s5: {
      h: "風險有哪些?",
      items: [
        "Bitfinex 倒掉風險(Counterparty risk)— Bitfinex 本身的體質決定。歷史紀錄:2016 年被駭損失 1.2 億美元,Bitfinex 用 BFX token 全額補償用戶 + 後續完整買回。",
        "市場利率風險 — 利率隨市場波動,有可能很長時間維持低檔。",
        "鎖倉期風險 — 你掛的 offer 通常 2-30 天到期。中途想提錢需先取消尚未被接走的 offer,已被接走的部分要等到期。",
        "API key 外洩風險 — Quiver 用最小權限 + IP allowlist,即使 key 外洩,攻擊者也無法提走你的錢(沒 Withdrawal 權限)。",
      ],
    },

    s6: {
      h: "需要哪些前置條件?",
      body: "你需要一個完成 KYC 的 Bitfinex 帳號(沒有的話下一頁有完整教學),還要把 USDT 存到 Bitfinex Funding 錢包。Quiver 連好之後會自動把你 Quiver 餘額的 USDT 送到 Funding 錢包並開始放貸。",
    },

    ctaPrimary: "下一步:如何註冊 Bitfinex →",
    ctaSecondary: "已有 Bitfinex 帳號?直接看 API key 教學 →",
  },

  en: {
    back: "Back to guide hub",
    title: "① What is Bitfinex Funding lending?",
    subtitle: "Bitfinex Funding lets you lend idle USDT to leverage traders who pay you interest. No technical knowledge required — 5 minutes to read.",

    s1: {
      h: "Why does anyone want to borrow USDT?",
      body: "Bitfinex is an exchange that supports margin (leveraged) trading. A trader who wants a 5x long position with only 2,000 USDT of their own needs to borrow 8,000 USDT to open the position. The people lending those 8,000 USDT are \"funding lenders\" — that's you. After Bitfinex's 15% commission, all the interest the trader pays goes to you.",
    },

    s2: {
      h: "Where does your USDT actually go?",
      lead: "Starting from your Quiver balance:",
      steps: [
        "You deposit USDT into Quiver (or receive an internal transfer)",
        "Quiver auto-sends USDT from your Quiver balance to your Bitfinex Funding wallet",
        "Quiver posts a funding offer on Bitfinex (e.g. \"lending 1,000 USDT for 2 days at 0.03% daily\")",
        "Margin traders accept your offer and your USDT is now lent out",
        "On expiry, Bitfinex automatically returns your principal + interest to your Funding wallet",
        "Quiver sees the funds returned and posts a fresh offer to keep earning",
      ],
      tail: "Throughout this flow your money stays in your own Bitfinex account — Quiver has no withdrawal permission. You can cancel or withdraw at any time on Bitfinex yourself.",
    },

    s3: {
      h: "How much can you actually earn?",
      lead: "Based on market conditions, Bitfinex Funding USDT rates in recent years have roughly fallen into these ranges (illustrative, not guaranteed):",
      rows: [
        { period: "Bear / calm", rate: "0.005-0.015% / day", apy: "1.8-5.5% APY" },
        { period: "Normal market", rate: "0.02-0.04% / day", apy: "7-15% APY" },
        { period: "Bull market / high demand", rate: "0.05-0.15% / day", apy: "18-50% APY" },
      ],
      note: "Quiver takes a perf fee on the interest you actually earn (Friend tier 5% / Public 15% / subscribed 0%) — never on principal.",
    },

    s4: {
      h: "How does it compare to other options?",
      items: [
        {
          name: "Traditional bank deposit",
          pro: "Very stable, deposit insurance",
          con: "1-2% APY — typically eaten by inflation",
        },
        {
          name: "DeFi (Aave, Compound)",
          pro: "Fully transparent on-chain, withdraw anytime",
          con: "Smart contract risk (multiple historical exploits), generally lower APY 3-5%",
        },
        {
          name: "Centralized Earn (Binance Earn, etc.)",
          pro: "Decent APY (5-12%)",
          con: "Funds custodied by platform — Celsius / FTX failures meant total loss for users",
        },
        {
          name: "Bitfinex Funding (this)",
          pro: "Funds in your own account / market-driven APY can reach 15-30%+",
          con: "Bitfinex failure risk (though after the 2016 hack they fully repaid users via BFX tokens)",
        },
      ],
    },

    s5: {
      h: "What are the risks?",
      items: [
        "Bitfinex insolvency / counterparty risk — depends on Bitfinex's health. History: 2016 hack of $120M; Bitfinex repaid all users via BFX tokens then bought them back at full value.",
        "Market rate risk — funding rates fluctuate, can stay low for long stretches.",
        "Lock-up risk — your offers typically last 2-30 days. To withdraw early you can cancel unfilled offers, but accepted offers must wait until maturity.",
        "API key compromise risk — Quiver uses minimal permissions + IP allowlist. Even if your key leaks, attackers cannot withdraw your funds (no Withdrawal permission).",
      ],
    },

    s6: {
      h: "What do you need to get started?",
      body: "You need a KYC-completed Bitfinex account (next page has the full guide if you don't have one) and USDT in your Bitfinex Funding wallet. Once Quiver is connected, it automatically sends USDT from your Quiver balance to the Funding wallet and starts lending.",
    },

    ctaPrimary: "Next: how to sign up for Bitfinex →",
    ctaSecondary: "Already have a Bitfinex account? Skip to API key guide →",
  },

  ja: {
    back: "ガイドトップに戻る",
    title: "① Bitfinex Funding 貸付とは?",
    subtitle: "Bitfinex Funding は、休眠中の USDT をレバレッジトレーダーに貸し出して利息を得る仕組みです。技術知識不要、5 分で理解できます。",

    s1: {
      h: "なぜ USDT を借りる人がいるのか?",
      body: "Bitfinex はマージン(レバレッジ)取引が可能な取引所です。自己資金 2,000 USDT で 5 倍ロングしたいトレーダーは、ポジションを開くため 8,000 USDT を借りる必要があります。この 8,000 USDT を貸し出すのが「funding lender」— あなたです。Bitfinex の 15% 手数料を引いた利息はすべてあなたのもの。",
    },

    s2: {
      h: "あなたの USDT はどう流れる?",
      lead: "Quiver 残高からの流れ:",
      steps: [
        "USDT を Quiver に入金(または内部送金で受け取り)",
        "Quiver があなたの Quiver 残高から自動的に Bitfinex Funding ウォレットへ送金",
        "Quiver が Bitfinex 上で funding offer を出す(例:「1,000 USDT を 2 日間、日利 0.03% で貸出」)",
        "マージン取引者があなたの offer を受け入れ、USDT が貸し出されます",
        "満期時、Bitfinex は自動で元本 + 利息を Funding ウォレットに返却",
        "Quiver が返金を検知し、次のラウンドを稼ぐため新しい offer を出します",
      ],
      tail: "全工程を通じて資金は常にあなた自身の Bitfinex アカウント内に — Quiver には出金権限はありません。Bitfinex 上のポジションはいつでも自分で取消・出金可能。",
    },

    s3: {
      h: "実際にいくら稼げる?",
      lead: "市場状況によりますが、Bitfinex Funding USDT の近年のレート帯はおおよそ以下のとおり(参考値、保証ではない):",
      rows: [
        { period: "ベア / 平穏期", rate: "0.005-0.015% / 日", apy: "1.8-5.5% APY" },
        { period: "通常市場", rate: "0.02-0.04% / 日", apy: "7-15% APY" },
        { period: "ブル市場 / 高需要", rate: "0.05-0.15% / 日", apy: "18-50% APY" },
      ],
      note: "Quiver は実際に得た利息に対して perf fee を取ります(Friend 5% / Public 15% / サブスク 0%)— 元本に手数料はかかりません。",
    },

    s4: {
      h: "他の選択肢との比較",
      items: [
        {
          name: "従来の銀行預金",
          pro: "非常に安定、預金保険あり",
          con: "1-2% APY — 通常インフレに食われる",
        },
        {
          name: "DeFi(Aave、Compound)",
          pro: "完全オンチェーンで透明、いつでも引出可能",
          con: "スマートコントラクトリスク(過去に複数の悪用事例)、APY は概ね低め 3-5%",
        },
        {
          name: "中央集権型 Earn(Binance Earn など)",
          pro: "APY は中程度(5-12%)",
          con: "資金はプラットフォームに預ける — Celsius / FTX 破綻時はユーザー全損",
        },
        {
          name: "Bitfinex Funding(本ガイド)",
          pro: "資金は自分のアカウント内 / 市場連動の APY は 15-30%+ も可能",
          con: "Bitfinex 破綻リスク(2016 年のハック後は BFX トークンで全額補償した実績あり)",
        },
      ],
    },

    s5: {
      h: "リスクは?",
      items: [
        "Bitfinex 破綻 / カウンターパーティリスク — Bitfinex 自体の健全性次第。過去:2016 年 1.2 億ドルのハック、Bitfinex は BFX トークンで全ユーザーに補償後、額面で買戻し。",
        "市場金利リスク — funding レートは変動し、低水準が長期化することもあります。",
        "ロックアップリスク — offer の期間は通常 2-30 日。早期引出は未約定 offer は取消可、約定済みは満期まで待つ必要があります。",
        "API キー漏洩リスク — Quiver は最小権限 + IP Allowlist を使用。鍵が漏れても攻撃者は資金を引き出せません(出金権限なし)。",
      ],
    },

    s6: {
      h: "始めるのに必要なものは?",
      body: "KYC 完了済みの Bitfinex アカウント(まだなら次ページに完全ガイドあり)と Bitfinex Funding ウォレットへの USDT 入金が必要です。Quiver の接続後は、Quiver 残高の USDT を自動的に Funding ウォレットへ送り貸付を開始します。",
    },

    ctaPrimary: "次へ:Bitfinex 登録方法 →",
    ctaSecondary: "Bitfinex アカウントあり?API キーガイドへ →",
  },
};

function pickLocale(locale: string): Locale {
  if (locale === "en" || locale === "ja") return locale;
  return "zh-TW";
}

export default function WhatIsBitfinexLendingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href={`/${locale}/guide`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{s.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s1.h}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <p>{s.s1.body}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s2.h}</CardTitle>
          <CardDescription>{s.s2.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <ol className="ml-4 list-decimal space-y-1.5">
            {s.s2.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="rounded-md border border-emerald-300/60 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {s.s2.tail}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s3.h}</CardTitle>
          <CardDescription>{s.s3.lead}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-edge text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Daily rate</th>
                  <th className="py-2 pr-4">APY</th>
                </tr>
              </thead>
              <tbody>
                {s.s3.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-cream-edge/60 dark:border-slate-800"
                  >
                    <td className="py-2 pr-4">{row.period}</td>
                    <td className="py-2 pr-4 font-mono">{row.rate}</td>
                    <td className="py-2 pr-4 font-mono text-emerald-700 dark:text-emerald-400">
                      {row.apy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">{s.s3.note}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s4.h}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {s.s4.items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-cream-edge p-3 dark:border-slate-700"
            >
              <div className="font-medium">{item.name}</div>
              <div className="mt-1 text-xs">
                <span className="text-emerald-700 dark:text-emerald-400">+ </span>
                <span className="text-slate-600 dark:text-slate-300">{item.pro}</span>
              </div>
              <div className="text-xs">
                <span className="text-rose-700 dark:text-rose-400">− </span>
                <span className="text-slate-600 dark:text-slate-300">{item.con}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s5.h}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <ul className="ml-4 list-disc space-y-1.5">
            {s.s5.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s6.h}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <p>{s.s6.body}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/${locale}/guide/sign-up-bitfinex`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          {s.ctaPrimary} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/${locale}/guide/bitfinex-api-key`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-cream-edge bg-paper px-4 py-2.5 text-sm font-medium text-slate-ink hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        >
          {s.ctaSecondary}
        </Link>
      </div>
    </div>
  );
}
