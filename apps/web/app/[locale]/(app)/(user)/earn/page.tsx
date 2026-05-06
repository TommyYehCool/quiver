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
import {
  fetchEarnFeesServer,
  fetchEarnMeServer,
  fetchEarnPerformanceServer,
  fetchEarnPublicStatsServer,
} from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActiveCreditRow } from "@/components/earn/active-credit-row";
import { BufferEmptyBanner } from "@/components/earn/buffer-empty-banner";
import { FeeStatusCard } from "@/components/earn/fee-status-card";
import { PendingOfferRow } from "@/components/earn/pending-offer-row";
import { StatusPill, accentBarClass, cardToneClass, cyberCardClass, type PillTone } from "@/components/earn/status-pill";
import { cn } from "@/lib/utils";
import { PerformanceCard } from "@/components/earn/performance-card";
import { PublicStatsStrip } from "@/components/earn/public-stats-strip";
// F-5a-3.10.3 — StrategyPreviewCard moved to its own page at /earn/strategy-lab.
// /earn focuses on live state (positions, credits, snapshots); the what-if
// explorer lives separately so it doesn't compete for attention here.
import type { EarnPositionStatus } from "@/lib/api/earn-user";

function fmtUsd(s: string | null): string {
  if (s === null) return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  // Adaptive precision — match Bitfinex display:
  //   $0          → "$0.00"
  //   $0.00873361 → "$0.00873361" (sub-cent, up to 8 decimals)
  //   $0.0087     → "$0.0087"     (sub-dollar, up to 4 decimals)
  //   $200.00     → "$200.00"     (dollar+, fixed 2 decimals)
  const abs = Math.abs(n);
  let min: number, max: number;
  if (abs === 0) { min = 2; max = 2; }
  else if (abs < 0.01) { min = 2; max = 8; }
  else if (abs < 1) { min = 2; max = 4; }
  else { min = 2; max = 2; }
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max })}`;
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
    lent: { label: string; sub: string; pill: string };
    pending: { label: string; sub: string; pill: string };
    funding: { label: string; sub: string; pill: string };
    earned: { label: string; sub: string; pill: string };
  };
  activeLoans: { title: string; desc: string };
  pendingOffers: { title: string; desc: string; rateFrr: string; rateFixed: string; periodDays: (n: number) => string };
  autoLend: {
    title: string;
    desc: string;
    statusOn: string;
    statusOff: string;
    movedNote: string;
    manageCta: string;
  };
  pipeline: { title: string; desc: string };
  recentSnapshots: { title: string; desc: string; date: string; lent: string; daily: string };
  footer: { connected: string; viewGuide: string };
  status: Record<EarnPositionStatus, string>;
}

const PAGE_STRINGS: Record<Locale, PageStrings> = {
  "zh-TW": {
    loadFailed: "無法載入 Earn 資料,請稍後再試或聯絡 admin。",
    headerSubtitle:
      "Quiver 自動把你的 USDT 送到你 Bitfinex Funding wallet 並轉換成 USD 掛單賺利息",
    tierBadge: {
      friend: "Friend 等級",
      public: "Public 等級",
      internal: "Internal",
      premium: "Premium",
      premiumSuffix: "· 0% 績效費",
      feeSuffix: (pct) => `· 績效費 ${pct}%`,
    },
    kycGate: { title: "先完成 KYC 驗證", descPrefix: "Earn 功能需要先通過 KYC。當前狀態:", cta: "去 KYC" },
    notSetup: {
      title: "連接你的 Bitfinex 帳號",
      desc:
        "提供你的 Bitfinex API key + Funding wallet 入金地址，Quiver 會自動把你存進來的 USDT 送過去並轉換成 USD 掛單。\n你的錢始終在你自己 KYC 過的 Bitfinex 帳號裡。",
      cta: "開始連接",
      viewGuide: "查看完整教學",
    },
    bigNumbers: {
      lent: { label: "已借出", sub: "由 margin trader 接走,每日結算", pill: "賺息中" },
      pending: { label: "掛單中", sub: "已提交 offer,等借方撮合", pill: "撮合中" },
      funding: { label: "等待掛單", sub: "Bitfinex Funding wallet 待掛 offer", pill: "等待中" },
      earned: { label: "當日預估收益", sub: "最新 snapshot 估算（非已入帳）", pill: "今日" },
    },
    activeLoans: {
      title: "目前借出",
      desc: "Bitfinex 上正在計息的 funding loans。\n每筆借期到期後自動回 funding wallet，系統會 auto-renew 重新掛單。",
    },
    pendingOffers: {
      title: "掛單中明細",
      desc: "已掛 funding offer、等待借方撮合。\n撮合後會自動轉成「目前借出」開始計息。",
      rateFrr: "FRR 市場單",
      rateFixed: "固定利率",
      periodDays: (n) => `${n} 天`,
    },
    autoLend: {
      title: "Auto-lend 自動放貸",
      desc: "打開時：每筆新存進 Quiver 的 USDT 會自動送到你的 Bitfinex 並轉換成 USD 掛單。關掉時：新 deposit 不會自動進入 Bitfinex (已借出的部位不受影響，自然到期回 funding wallet)。",
      statusOn: "已開啟",
      statusOff: "已關閉",
      movedNote: "(toggle 已移到放貸機器人設定)",
      manageCta: "前往設定",
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
      offer_pending: "掛單中,等借方撮合",
      lent: "已借出,計息中",
      closing: "贖回中",
      closed_external: "已贖回",
      failed: "失敗 — 請聯絡 admin",
    },
  },
  en: {
    loadFailed: "Failed to load Earn data: please try again later or contact admin.",
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
    /* en keeps "perf fee" — it's domain jargon English speakers in fintech understand. */
    kycGate: { title: "Complete KYC first", descPrefix: "Earn requires KYC approval. Current status: ", cta: "Go to KYC" },
    notSetup: {
      title: "Connect your Bitfinex account",
      desc:
        "Provide your Bitfinex API key + Funding wallet deposit address. Quiver will auto-send your deposits over and post funding offers. Your money stays in your own KYC'd Bitfinex account.",
      cta: "Start connecting",
      viewGuide: "View full guide",
    },
    bigNumbers: {
      lent: { label: "Lent (earning)", sub: "Borrowed by margin traders, settled daily", pill: "Earning" },
      pending: { label: "Pending offer", sub: "Submitted, waiting to be matched", pill: "Pending" },
      funding: { label: "Waiting in Funding (idle)", sub: "In Bitfinex Funding wallet, not yet offered", pill: "Waiting" },
      earned: { label: "Estimated earnings today", sub: "Latest snapshot estimate (not yet credited)", pill: "Today" },
    },
    activeLoans: {
      title: "Active loans",
      desc: "Funding loans currently earning interest on Bitfinex. After each term, funds return to the Funding wallet and the system auto-renews with a fresh offer.",
    },
    pendingOffers: {
      title: "Pending offers",
      desc: "Funding offers submitted to Bitfinex, waiting for a borrower match. Once matched they become active loans and start earning interest.",
      rateFrr: "FRR market order",
      rateFixed: "Fixed rate",
      periodDays: (n) => `${n} days`,
    },
    autoLend: {
      title: "Auto-lend",
      desc: "When ON: every new USDT deposit to Quiver is automatically sent to your Bitfinex and offered out. When OFF: new deposits stay in Quiver (existing lent positions are unaffected and roll off naturally on offer expiry).",
      statusOn: "ON",
      statusOff: "OFF",
      movedNote: "(toggle moved to bot settings)",
      manageCta: "Manage",
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
      offer_pending: "Pending match",
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
      premiumSuffix: "· 0% パフォーマンスフィー",
      feeSuffix: (pct) => `· パフォーマンスフィー ${pct}%`,
    },
    kycGate: { title: "先に本人確認を完了", descPrefix: "Earn の利用には KYC 承認が必要です。現在のステータス:", cta: "本人確認へ" },
    notSetup: {
      title: "Bitfinex アカウントを接続",
      desc:
        "Bitfinex API キー + Funding ウォレットの入金アドレスを提供してください。Quiver はあなたの入金を自動的に送り、funding offer を出します。資金は常にあなた自身の KYC 済み Bitfinex アカウント内に保管されます。",
      cta: "接続を開始",
      viewGuide: "完全なガイドを見る",
    },
    bigNumbers: {
      lent: { label: "貸出中(利息収入中)", sub: "margin トレーダーに貸付、毎日結算", pill: "稼働中" },
      pending: { label: "発注中 (Pending)", sub: "offer 送信済み、貸付待ち", pill: "マッチ待ち" },
      funding: { label: "待機中(Funding idle)", sub: "Bitfinex Funding ウォレットで offer 待ち", pill: "待機中" },
      earned: { label: "本日の予想収益", sub: "最新スナップショット推定（未着金）", pill: "本日" },
    },
    activeLoans: {
      title: "現在の貸出",
      desc: "Bitfinex 上で利息収入中の funding loans。各期間終了後は自動的に funding wallet に戻り、システムが自動更新で再掲します。",
    },
    pendingOffers: {
      title: "発注中の offer",
      desc: "Bitfinex に送信済み、貸付者のマッチング待ち。マッチング後は「現在の貸出」に移行し利息収入が始まります。",
      rateFrr: "FRR マーケット注文",
      rateFixed: "固定利率",
      periodDays: (n) => `${n} 日`,
    },
    autoLend: {
      title: "Auto-lend 自動貸出",
      desc: "ON の場合:Quiver への新規入金は自動的に Bitfinex に送られ offer が出ます。OFF の場合:新規入金は Bitfinex に自動で送られません(既存の貸出ポジションは影響を受けず、満期に自然に funding wallet に戻ります)。",
      statusOn: "ON",
      statusOff: "OFF",
      movedNote: "(toggle はボット設定に移動)",
      manageCta: "管理",
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
      offer_pending: "発注中、貸付待ち",
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
  // Parallel-fetch all data (earn-me, performance, public-stats, fees) — no
  // dependency between them, so awaiting in series wastes ~800ms.
  const [earn, perf, publicStats, fees] = await Promise.all([
    fetchEarnMeServer(cookieHeader),
    fetchEarnPerformanceServer(cookieHeader),
    fetchEarnPublicStatsServer(),
    fetchEarnFeesServer(cookieHeader),
  ]);
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

      {/* F-5b-1 — Public stats hero strip. Always shown (even pre-KYC) so
           visitors get social proof before they commit to the funnel. */}
      {publicStats ? <PublicStatsStrip locale={locale} stats={publicStats} /> : null}

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
            <CardDescription className="whitespace-pre-line">{s.notSetup.desc}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={`/${locale}/earn/bot-settings`}>
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
          {/* F-5b-5 buffer-empty banner — proactive prompt to deposit USDT
               into Quiver wallet so perf fees can settle each Monday. Auto-
               disappears once balance >= $30. Skipped for Friend tier and
               Premium subscribers (they don't pay perf fees). */}
          {fees ? (
            <BufferEmptyBanner
              locale={locale}
              walletBalance={fees.quiver_wallet_balance_usdt}
              isExempt={fees.perf_fee_bps === 0 || fees.is_premium}
            />
          ) : null}

          {/* ═══ LIVE STATUS — big numbers ═══ */}
          {/* 4-card grid (lent / pending / funding / earned). 2 cols on small,
              4 cols on md+. Pending card always rendered for consistency
              even when 0 — UX feedback that the row exists.
              F-5a-3.11: each amount carries a currency suffix. Backend /me
              currently returns fUST data only; USD positions show in the
              new "USD positions" card below (added in a follow-up). */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <DualCurrencyCard
              label={s.bigNumbers.lent.label}
              sub={s.bigNumbers.lent.sub}
              usdt={earn.lent_usdt}
              usd={earn.lent_usd}
              pillTone="emerald"
              pillLabel={s.bigNumbers.lent.pill}
            />
            <DualCurrencyCard
              label={s.bigNumbers.pending.label}
              sub={s.bigNumbers.pending.sub}
              usdt={earn.pending_offers_total_usdt}
              usd={earn.pending_offers_total_usd}
              pillTone="amber"
              pillLabel={s.bigNumbers.pending.pill}
            />
            <DualCurrencyCard
              label={s.bigNumbers.funding.label}
              sub={s.bigNumbers.funding.sub}
              usdt={earn.funding_idle_usdt}
              usd={earn.funding_idle_usd}
              pillTone="red"
              pillLabel={s.bigNumbers.funding.pill}
            />
            <DualCurrencyCard
              label={s.bigNumbers.earned.label}
              sub={s.bigNumbers.earned.sub}
              usdt={earn.daily_earned_usdt}
              usd={earn.daily_earned_usd}
              pillTone="emerald"
              pillLabel={s.bigNumbers.earned.pill}
            />
          </div>

          {/* F-5b-1 strategy performance card — placed right after big numbers
               so it's the first thing the user reads on a real dashboard. */}
          {perf ? <PerformanceCard locale={locale} perf={perf} /> : null}

          {/* ═══ LIVE BITFINEX STATE — credits / offers / pipeline ═══ */}

          {/* Active loans (matched, earning) */}
          {earn.active_credits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{s.activeLoans.title}</CardTitle>
                <CardDescription className="whitespace-pre-line">{s.activeLoans.desc}</CardDescription>
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

          {/* Pending offers (submitted, not matched yet). Each row gets
              Cancel + Edit buttons via the client-side PendingOfferRow
              component (F-5a-3.9). */}
          {earn.pending_offers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{s.pendingOffers.title}</CardTitle>
                <CardDescription className="whitespace-pre-line">{s.pendingOffers.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earn.pending_offers.map((o) => (
                    <PendingOfferRow key={o.id} offer={o} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pipeline status (deposit → onchain → funding → offer → matched) */}
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

          {/* ═══ HISTORY ═══ */}

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

          {/* ═══ SETTINGS / META ═══ */}
          {/* Less directly tied to "what's happening with my money RIGHT NOW",
              so they live below the live state + history. Reordered as part
              of the pending-offer-card drop. */}

          {/* F-5b-2 perf fee status card — visibility into accruals + buffer
               warnings. Card itself decides whether to show full table (Public
               tier) or compact exempt pill (Friend / Premium). */}
          {fees ? <FeeStatusCard locale={locale} fees={fees} /> : null}

          {/* Auto-lend toggle moved to /earn/bot-settings (F-5a-1.1).
              Show a small status badge here with a link, instead of duplicating
              the toggle. Keeps this page focused on read-only stats. */}
          <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-base">{s.autoLend.title}</CardTitle>
                <CardDescription>
                  <span
                    className={
                      earn.auto_lend_enabled
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : "font-medium text-slate-600 dark:text-slate-400"
                    }
                  >
                    {earn.auto_lend_enabled ? s.autoLend.statusOn : s.autoLend.statusOff}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    {s.autoLend.movedNote}
                  </span>
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/${locale}/earn/bot-settings`}>
                  {s.autoLend.manageCta} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
          </Card>

          {/* Bitfinex connected info footer */}
          <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
            <CardContent className="flex flex-col gap-2 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>{s.footer.connected}</span>
                <code className="font-mono text-xs">
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
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        ✦ {strings.premium}
        <span className="text-xs opacity-70">{strings.premiumSuffix}</span>
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
      <span className="text-xs opacity-70">{strings.feeSuffix(pct)}</span>
    </span>
  );
}

/**
 * F-5a-3.11 — big-number card that handles 0/1/2-currency display:
 *   - both 0      → single $0.00 USDT line (default tone)
 *   - only USDT   → single line with "USDT" suffix
 *   - only USD    → single line with "USD" suffix
 *   - both > 0    → 2 stacked lines (USDT first, USD below)
 *
 * Lets us keep the 4-card grid layout intact while transparently
 * showing per-currency breakdown when the user has positions in both.
 */
function DualCurrencyCard({
  label,
  sub,
  usdt,
  usd,
  pillTone,
  pillLabel,
}: {
  label: string;
  sub: string;
  usdt: string | null;
  usd: string | null;
  pillTone: PillTone;
  pillLabel: string;
}) {
  const usdtNum = Number(usdt ?? 0);
  const usdNum = Number(usd ?? 0);
  const showBoth = usdtNum > 0 && usdNum > 0;
  // value text color follows the pill tone for visual coherence
  const colorMain =
    pillTone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : pillTone === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
        : pillTone === "red"
          ? "text-red-600 dark:text-red-400"
          : "";
  const colorSuffix =
    pillTone === "amber"
      ? "text-amber-700/70 dark:text-amber-400/70"
      : pillTone === "emerald"
        ? "text-emerald-700/70 dark:text-emerald-500/70"
        : pillTone === "red"
          ? "text-red-700/70 dark:text-red-400/70"
          : "text-slate-500";
  return (
    <Card className={cyberCardClass(pillTone)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <StatusPill tone={pillTone} label={pillLabel} />
        </div>
        {showBoth ? (
          <div className="space-y-0.5">
            <CardTitle className={`font-mono text-2xl ${colorMain}`}>
              {fmtUsd(usdt)}
              <span className={`ml-1 text-sm ${colorSuffix}`}>USDT</span>
            </CardTitle>
            <CardTitle className={`font-mono text-2xl ${colorMain}`}>
              {fmtUsd(usd)}
              <span className={`ml-1 text-sm ${colorSuffix}`}>USD</span>
            </CardTitle>
          </div>
        ) : (
          <CardTitle className={`font-mono text-2xl ${colorMain}`}>
            {usdNum > 0 ? fmtUsd(usd) : fmtUsd(usdt)}
            <span className={`ml-1 text-sm ${colorSuffix}`}>
              {usdNum > 0 ? "USD" : "USDT"}
            </span>
          </CardTitle>
        )}
      </CardHeader>
      <CardContent className="text-xs text-slate-500">{sub}</CardContent>
    </Card>
  );
}

const STATUS_TONE: Record<EarnPositionStatus, string> = {
  pending_outbound: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
  onchain_in_flight: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  funding_idle: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  // F-5a-3.8: amber (matches the pending-offer card accent) — "in-flight,
  // not yet earning". Visually distinct from emerald (= matched, earning).
  offer_pending: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  lent: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  closing: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  closed_external: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400",
  failed: "bg-red-500/20 text-red-700 dark:text-red-300",
};
