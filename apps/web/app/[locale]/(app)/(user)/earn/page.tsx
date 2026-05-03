import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import { fetchEarnMeServer } from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutoLendToggle } from "@/components/earn/auto-lend-toggle";
import { ActiveCreditRow } from "@/components/earn/active-credit-row";
import type { EarnPositionStatus } from "@/lib/api/earn-user";

function fmtUsd(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Locale = "zh-TW" | "en" | "ja";

interface PageStrings {
  loadFailed: string;
  headerSubtitle: string;
  tierBadge: {
    friend: string;
    public: string;
    internal: string;
    premium: string;
    premiumSuffix: string;
    feeSuffix: (pct: string) => string;
  };
  kycGate: { title: string; descPrefix: string; cta: string };
  notSetup: { title: string; desc: string; cta: string; viewGuide: string };
  bigNumbers: {
    lent: { label: string; sub: string };
    funding: { label: string; sub: string };
    earned: { label: string; sub: string };
  };
  activeLoans: { title: string; desc: string };
  autoLend: { title: string; desc: string };
  pipeline: { title: string; desc: string };
  recentSnapshots: { title: string; desc: string; date: string; lent: string; daily: string };
  footer: { connected: string; viewGuide: string };
  status: Record<EarnPositionStatus, string>;
}

const PAGE_STRINGS: Record<Locale, PageStrings> = {
  "zh-TW": {
    loadFailed: "無法載入 Earn 資料,請稍後再試或聯絡 admin。",
    headerSubtitle:
      "Quiver 自動把你的 USDT 送到你 Bitfinex Funding wallet 並掛 funding offer 賺利息",
    tierBadge: {
      friend: "Friend 等級",
      public: "Public 等級",
      internal: "Internal",
      premium: "Premium",
      premiumSuffix: "· 0% perf fee",
      feeSuffix: (pct) => `· perf fee ${pct}%`,
    },
    kycGate: { title: "先完成 KYC 驗證", descPrefix: "Earn 功能需要先通過 KYC。當前狀態:", cta: "去 KYC" },
    notSetup: {
      title: "連接你的 Bitfinex 帳號",
      desc:
        "提供你的 Bitfinex API key + Funding wallet 入金地址,Quiver 會自動把你存進來的 USDT 送過去並掛 funding offer。你的錢始終在你自己 KYC 過的 Bitfinex 帳號裡,Quiver 沒有提現權限。",
      cta: "開始連接",
      viewGuide: "查看完整教學",
    },
    bigNumbers: {
      lent: { label: "已借出 (賺息中)", sub: "由 margin trader 接走,每日結算" },
      funding: { label: "等待掛單 (Funding idle)", sub: "Bitfinex Funding wallet 待掛 offer" },
      earned: { label: "當日累計賺到", sub: "最新 snapshot 估算" },
    },
    activeLoans: {
      title: "目前借出",
      desc: "Bitfinex 上正在計息的 funding loans。每筆借期到期後自動回 funding wallet,系統會 auto-renew 重新掛單。",
    },
    autoLend: {
      title: "Auto-lend 自動放貸",
      desc: "打開時:每筆新存進 Quiver 的 USDT 會自動送到你 Bitfinex 並掛 offer。關掉時:新 deposit 不會自動進入 Bitfinex(已借出的部位不受影響,自然到期回 funding wallet)。",
    },
    pipeline: { title: "進行中的部位", desc: "每筆 deposit 從進 Quiver 到掛上 offer 的 pipeline 狀態" },
    recentSnapshots: {
      title: "最近 30 天",
      desc: "每日 snapshot — funding / lent / 當日 earned",
      date: "日期",
      lent: "Lent",
      daily: "當日賺",
    },
    footer: { connected: "已連接 Bitfinex · 入金地址", viewGuide: "查看設定教學 →" },
    status: {
      pending_outbound: "準備發送",
      onchain_in_flight: "鏈上轉帳中",
      funding_idle: "Bitfinex 已收到,準備掛單",
      lent: "已借出,計息中",
      closing: "贖回中",
      closed_external: "已贖回",
      failed: "失敗 — 請聯絡 admin",
    },
  },
  en: {
    loadFailed: "Failed to load Earn data — please try again later or contact admin.",
    headerSubtitle:
      "Quiver automatically sends your USDT to your Bitfinex Funding wallet and posts a funding offer to earn interest",
    tierBadge: {
      friend: "Friend tier",
      public: "Public tier",
      internal: "Internal",
      premium: "Premium",
      premiumSuffix: "· 0% perf fee",
      feeSuffix: (pct) => `· perf fee ${pct}%`,
    },
    kycGate: { title: "Complete KYC first", descPrefix: "Earn requires KYC approval. Current status: ", cta: "Go to KYC" },
    notSetup: {
      title: "Connect your Bitfinex account",
      desc:
        "Provide your Bitfinex API key + Funding wallet deposit address. Quiver will auto-send your deposits over and post funding offers. Your money stays in your own KYC'd Bitfinex account — Quiver has no withdrawal permission.",
      cta: "Start connecting",
      viewGuide: "View full guide",
    },
    bigNumbers: {
      lent: { label: "Lent (earning)", sub: "Borrowed by margin traders, settled daily" },
      funding: { label: "Waiting in Funding (idle)", sub: "In Bitfinex Funding wallet, not yet offered" },
      earned: { label: "Earned today", sub: "From latest snapshot estimate" },
    },
    activeLoans: {
      title: "Active loans",
      desc: "Funding loans currently earning interest on Bitfinex. After each term, funds return to the Funding wallet and the system auto-renews with a fresh offer.",
    },
    autoLend: {
      title: "Auto-lend",
      desc: "When ON: every new USDT deposit to Quiver is automatically sent to your Bitfinex and offered out. When OFF: new deposits stay in Quiver (existing lent positions are unaffected and roll off naturally on offer expiry).",
    },
    pipeline: { title: "In-flight positions", desc: "Pipeline status of each deposit from Quiver to a funding offer" },
    recentSnapshots: {
      title: "Last 30 days",
      desc: "Daily snapshot — funding / lent / earned today",
      date: "Date",
      lent: "Lent",
      daily: "Earned",
    },
    footer: { connected: "Connected to Bitfinex · deposit address", viewGuide: "View setup guide →" },
    status: {
      pending_outbound: "Preparing",
      onchain_in_flight: "On-chain transfer",
      funding_idle: "Bitfinex received, posting offer",
      lent: "Lent, earning",
      closing: "Closing",
      closed_external: "Closed",
      failed: "Failed — contact admin",
    },
  },
  ja: {
    loadFailed: "Earn データの読み込みに失敗しました。後ほど再試行するか、管理者にお問い合わせください。",
    headerSubtitle:
      "Quiver があなたの USDT を Bitfinex Funding ウォレットに送り、funding offer を出して利息を得ます",
    tierBadge: {
      friend: "Friend ティア",
      public: "Public ティア",
      internal: "Internal",
      premium: "Premium",
      premiumSuffix: "· 0% perf fee",
      feeSuffix: (pct) => `· perf fee ${pct}%`,
    },
    kycGate: { title: "先に本人確認を完了", descPrefix: "Earn の利用には KYC 承認が必要です。現在のステータス:", cta: "本人確認へ" },
    notSetup: {
      title: "Bitfinex アカウントを接続",
      desc:
        "Bitfinex API キー + Funding ウォレットの入金アドレスを提供してください。Quiver はあなたの入金を自動的に送り、funding offer を出します。資金は常にあなた自身の KYC 済み Bitfinex アカウント内 — Quiver には出金権限はありません。",
      cta: "接続を開始",
      viewGuide: "完全なガイドを見る",
    },
    bigNumbers: {
      lent: { label: "貸出中(利息収入中)", sub: "margin トレーダーに貸付、毎日結算" },
      funding: { label: "待機中(Funding idle)", sub: "Bitfinex Funding ウォレットで offer 待ち" },
      earned: { label: "本日の収益", sub: "最新スナップショット推定" },
    },
    activeLoans: {
      title: "現在の貸出",
      desc: "Bitfinex 上で利息収入中の funding loans。各期間終了後は自動的に funding wallet に戻り、システムが自動更新で再掲します。",
    },
    autoLend: {
      title: "Auto-lend 自動貸出",
      desc: "ON の場合:Quiver への新規入金は自動的に Bitfinex に送られ offer が出ます。OFF の場合:新規入金は Bitfinex に自動で送られません(既存の貸出ポジションは影響を受けず、満期に自然に funding wallet に戻ります)。",
    },
    pipeline: { title: "進行中のポジション", desc: "各入金が Quiver から funding offer まで進むパイプラインのステータス" },
    recentSnapshots: {
      title: "過去 30 日",
      desc: "日次スナップショット — funding / lent / 本日の収益",
      date: "日付",
      lent: "Lent",
      daily: "本日の収益",
    },
    footer: { connected: "Bitfinex に接続済み · 入金アドレス", viewGuide: "設定ガイドを見る →" },
    status: {
      pending_outbound: "送信準備中",
      onchain_in_flight: "オンチェーン転送中",
      funding_idle: "Bitfinex が受信、offer 提出待ち",
      lent: "貸出中、利息発生",
      closing: "解除中",
      closed_external: "解除完了",
      failed: "失敗 — 管理者にお問い合わせください",
    },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export default async function EarnPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const s = PAGE_STRINGS[pickLocale(locale)];
  const earn = await fetchEarnMeServer(cookieHeader);
  if (!earn) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {s.loadFailed}
          </CardContent>
        </Card>
      </div>
    );
  }

  const setupComplete = earn.has_earn_account && earn.bitfinex_connected;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
          <TrendingUp className="h-6 w-6 text-emerald-700" />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">Earn</h1>
            {earn.has_earn_account && earn.earn_tier && earn.earn_tier !== "none" ? (
              <TierBadge
                tier={earn.earn_tier}
                feeBps={earn.perf_fee_bps ?? 0}
                isPremium={earn.is_premium}
                strings={s.tierBadge}
              />
            ) : null}
          </div>
          <p className="text-sm text-slate-500">{s.headerSubtitle}</p>
        </div>
      </div>

      {/* KYC gate */}
      {earn.kyc_status !== "APPROVED" && (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="flex-row items-start gap-3">
            <ShieldCheck className="h-5 w-5 flex-none text-amber-600" />
            <div className="flex-1">
              <CardTitle className="text-base">{s.kycGate.title}</CardTitle>
              <CardDescription>
                {s.kycGate.descPrefix}
                <span className="ml-1 font-mono text-xs">{earn.kyc_status}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/${locale}/kyc`}>
                {s.kycGate.cta} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No setup yet — connect CTA */}
      {earn.kyc_status === "APPROVED" && !setupComplete && (
        <Card>
          <CardHeader>
            <CardTitle>{s.notSetup.title}</CardTitle>
            <CardDescription>{s.notSetup.desc}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={`/${locale}/earn/connect`}>
                {s.notSetup.cta} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/guide`}>{s.notSetup.viewGuide}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active state — main dashboard */}
      {setupComplete && (
        <>
          {/* Big numbers */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{s.bigNumbers.lent.label}</CardDescription>
                <CardTitle className="font-mono text-2xl">{fmtUsd(earn.lent_usdt)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">{s.bigNumbers.lent.sub}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{s.bigNumbers.funding.label}</CardDescription>
                <CardTitle className="font-mono text-2xl">{fmtUsd(earn.funding_idle_usdt)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">{s.bigNumbers.funding.sub}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{s.bigNumbers.earned.label}</CardDescription>
                <CardTitle className="font-mono text-2xl text-emerald-600">
                  {fmtUsd(earn.daily_earned_usdt)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">{s.bigNumbers.earned.sub}</CardContent>
            </Card>
          </div>

          {/* Active loans */}
          {earn.active_credits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{s.activeLoans.title}</CardTitle>
                <CardDescription>{s.activeLoans.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earn.active_credits.map((c) => (
                    <ActiveCreditRow key={c.id} credit={c} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-lend toggle */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{s.autoLend.title}</CardTitle>
                <CardDescription>{s.autoLend.desc}</CardDescription>
              </div>
              <AutoLendToggle initial={earn.auto_lend_enabled} />
            </CardHeader>
          </Card>

          {/* Pipeline status */}
          {earn.active_positions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{s.pipeline.title}</CardTitle>
                <CardDescription>{s.pipeline.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earn.active_positions.map((p) => {
                    const label = s.status[p.status as EarnPositionStatus] ?? s.status.failed;
                    const tone = STATUS_TONE[p.status as EarnPositionStatus] ?? STATUS_TONE.failed;
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col gap-2 rounded-lg border border-cream-edge bg-paper p-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Coins className="h-4 w-4 text-slate-400" />
                          <span className="font-mono">{fmtUsd(p.amount)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
                            {label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.bitfinex_offer_id && `offer #${p.bitfinex_offer_id}`}
                          {p.last_error && (
                            <span className="text-red-500">⚠ {p.last_error.slice(0, 80)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent snapshots */}
          {earn.recent_snapshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{s.recentSnapshots.title}</CardTitle>
                <CardDescription>{s.recentSnapshots.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                        <th className="py-2">{s.recentSnapshots.date}</th>
                        <th className="py-2 text-right">Funding</th>
                        <th className="py-2 text-right">{s.recentSnapshots.lent}</th>
                        <th className="py-2 text-right">{s.recentSnapshots.daily}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earn.recent_snapshots.slice(-10).reverse().map((snap) => (
                        <tr key={snap.snapshot_date} className="border-b border-cream-edge/50 dark:border-slate-800">
                          <td className="py-2 font-mono">{snap.snapshot_date}</td>
                          <td className="py-2 text-right font-mono">{fmtUsd(snap.bitfinex_funding_usdt)}</td>
                          <td className="py-2 text-right font-mono">{fmtUsd(snap.bitfinex_lent_usdt)}</td>
                          <td className="py-2 text-right font-mono text-emerald-600">
                            {fmtUsd(snap.bitfinex_daily_earned)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bitfinex connected info footer */}
          <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
            <CardContent className="flex flex-col gap-2 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>{s.footer.connected}</span>
                <code className="font-mono text-[10px]">
                  {earn.bitfinex_funding_address?.slice(0, 8)}...{earn.bitfinex_funding_address?.slice(-6)}
                </code>
              </div>
              <Link
                href={`/${locale}/guide/bitfinex-api-key`}
                className="text-xs text-brand hover:underline"
              >
                {s.footer.viewGuide}
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TierBadge({
  tier,
  feeBps,
  isPremium,
  strings,
}: {
  tier: string;
  feeBps: number;
  isPremium: boolean;
  strings: PageStrings["tierBadge"];
}) {
  // Premium overrides the tier badge — user pays 0% regardless of underlying tier
  if (isPremium) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        ✦ {strings.premium}
        <span className="text-[10px] opacity-70">{strings.premiumSuffix}</span>
      </span>
    );
  }

  const label =
    tier === "friend"
      ? strings.friend
      : tier === "internal"
        ? strings.internal
        : strings.public;
  const tone =
    tier === "friend"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tier === "internal"
        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
        : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  const pct = (feeBps / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
      <span className="text-[10px] opacity-70">{strings.feeSuffix(pct)}</span>
    </span>
  );
}

const STATUS_TONE: Record<EarnPositionStatus, string> = {
  pending_outbound: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
  onchain_in_flight: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  funding_idle: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  lent: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  closing: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  closed_external: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400",
  failed: "bg-red-500/20 text-red-700 dark:text-red-300",
};
