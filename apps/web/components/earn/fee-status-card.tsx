/**
 * F-5b-2 — Perf fee status card on /earn.
 *
 * Surfaces what's structurally invisible in self-custody mode: Quiver
 * deducts the perf fee from the user's *Quiver wallet*, not from their
 * Bitfinex earnings (we have no withdrawal permission). If the wallet is
 * empty (typical right after auto-lend dispatches), accruals pile up
 * until the user tops up.
 *
 * Renders three states:
 *   1. Friend tier (perf_fee_bps = 0)        → exempt pill, no table
 *   2. Premium subscriber                     → exempt pill (different copy)
 *   3. Public tier with active accruals      → full card with buffer warning
 *
 * Server component (data is server-fetched on /earn).
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Crown, PauseCircle, Receipt, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EarnFeeSummaryOut, FeeAccrualStatus } from "@/lib/api/earn-user";
import { cn } from "@/lib/utils";

type Locale = "zh-TW" | "en" | "ja";

interface FeeStrings {
  title: string;
  subtitlePublic: (pct: string) => string;
  subtitleFriend: string;
  subtitlePremium: string;
  exemptFriendBadge: string;
  exemptPremiumBadge: string;
  pendingLabel: string;
  pendingCount: (n: number) => string;
  noPending: string;
  walletLabel: string;
  walletInsufficient: string;
  walletOk: string;
  bufferWarningTitle: string;
  bufferWarningBody: (shortfall: string) => string;
  bufferTopupCta: string;
  /** F-5b-2: rendered when dunning_level === "paused" */
  pausedTitle: string;
  pausedBody: (pendingAmount: string, pendingCount: number) => string;
  pausedTopupCta: string;
  pausedPremiumCta: string;
  paid30dLabel: string;
  paidLifetimeLabel: string;
  nextSettleLabel: string;
  nextSettleHint: string;
  recentTitle: string;
  recentEmpty: string;
  recentColPeriod: string;
  recentColEarnings: string;
  recentColFee: string;
  recentColStatus: string;
  statusLabel: Record<FeeAccrualStatus, string>;
  premiumUpsellTitle: string;
  premiumUpsellBody: string;
  premiumUpsellCta: string;
  alwaysFree: string;
}

const STRINGS: Record<Locale, FeeStrings> = {
  "zh-TW": {
    title: "Quiver 平台費",
    subtitlePublic: (pct) =>
      `從你的利息收入抽 ${pct}% 績效費。Quiver 沒有 Bitfinex 提現權限,所以 fee 從你的 Quiver wallet 餘額扣 — Quiver wallet 留 buffer 才不會延遲扣款。`,
    subtitleFriend:
      "你在 Friend 等級 — 不收績效費。下面紀錄留空是正常的。謝謝你早期支持 🙇",
    subtitlePremium:
      "你訂閱了 Premium — 0% 績效費,本期不算 accrual。下方僅供查看歷史。",
    exemptFriendBadge: "Friend · 0% 永久免費",
    exemptPremiumBadge: "Premium · 訂閱中",
    pendingLabel: "待扣費用",
    pendingCount: (n) => `共 ${n} 筆 ACCRUED`,
    noPending: "無待扣項目",
    walletLabel: "Quiver wallet 餘額",
    walletInsufficient: "⚠ 不夠下次扣款",
    walletOk: "✓ 夠下次扣款",
    bufferWarningTitle: "扣款 buffer 不夠",
    bufferWarningBody: (shortfall) =>
      `下個週一 02:00 UTC 結算時你的 Quiver wallet 餘額不足以扣完 (差 $${shortfall})。差額會留在 ACCRUED 等下次,但建議現在就補 — 連續積欠多週可能觸發暫停 auto-lend。`,
    bufferTopupCta: "去儲值 Quiver wallet",
    pausedTitle: "Auto-lend 已被 Quiver 暫停",
    pausedBody: (amt, n) =>
      `已積欠 ${n} 週共 $${amt} 未付,Quiver 已自動暫停你的 auto-lend(已 lent 部位不受影響、自然到期回 funding wallet)。儲值 Quiver wallet 至 $${amt} 以上,下個週一 cron 會自動 resume;或升級 Premium 直接 0% 績效費。`,
    pausedTopupCta: "去儲值 Quiver wallet",
    pausedPremiumCta: "升級 Premium",
    paid30dLabel: "30 天已付",
    paidLifetimeLabel: "歷史總付",
    nextSettleLabel: "下次結算",
    nextSettleHint: "每週一 02:00 UTC 自動跑",
    recentTitle: "最近 12 筆紀錄",
    recentEmpty: "尚未產生任何 accrual。Quiver 每週一 02:00 UTC 計算上週收益。",
    recentColPeriod: "結算期間",
    recentColEarnings: "毛利息",
    recentColFee: "Fee",
    recentColStatus: "狀態",
    statusLabel: {
      ACCRUED: "待扣",
      PAID: "已付",
      WAIVED: "豁免",
    },
    premiumUpsellTitle: "想跳過自動扣款追蹤?",
    premiumUpsellBody:
      "Premium 月訂閱 = 0% 績效費。一筆固定金額換不用煩惱 buffer / 累積 / 多週積欠。",
    premiumUpsellCta: "了解 Premium →",
    alwaysFree: "Friend 等級永遠免費",
  },
  en: {
    title: "Quiver platform fee",
    subtitlePublic: (pct) =>
      `${pct}% performance fee from your interest income. Quiver has no withdrawal permission on Bitfinex, so the fee is deducted from your Quiver wallet balance — keep a buffer to avoid arrears.`,
    subtitleFriend:
      "You're on the Friend tier — no performance fee. The history below stays empty. Thanks for the early support 🙇",
    subtitlePremium:
      "You're a Premium subscriber — 0% performance fee, no accruals this period. Showing history only.",
    exemptFriendBadge: "Friend · 0% forever",
    exemptPremiumBadge: "Premium · subscribed",
    pendingLabel: "Pending fee",
    pendingCount: (n) => `${n} ACCRUED row${n === 1 ? "" : "s"}`,
    noPending: "Nothing pending",
    walletLabel: "Quiver wallet balance",
    walletInsufficient: "⚠ Insufficient for next deduction",
    walletOk: "✓ Enough for next deduction",
    bufferWarningTitle: "Insufficient buffer",
    bufferWarningBody: (shortfall) =>
      `At next Monday 02:00 UTC settlement your Quiver wallet won't cover the pending fees (short $${shortfall}). The shortfall stays ACCRUED for next attempt — top up to avoid auto-lend being paused after multiple unpaid weeks.`,
    bufferTopupCta: "Top up Quiver wallet",
    pausedTitle: "Auto-lend paused by Quiver",
    pausedBody: (amt, n) =>
      `${n} unpaid weeks ($${amt} total). Quiver has paused your auto-lend (existing lent positions are unaffected and will return to your Bitfinex funding wallet on natural maturity). Top up your Quiver wallet to $${amt}+ and the next Monday cron will auto-resume; or upgrade to Premium for flat 0% perf fee.`,
    pausedTopupCta: "Top up Quiver wallet",
    pausedPremiumCta: "Upgrade to Premium",
    paid30dLabel: "Paid (30d)",
    paidLifetimeLabel: "Lifetime paid",
    nextSettleLabel: "Next settlement",
    nextSettleHint: "Cron runs every Monday 02:00 UTC",
    recentTitle: "Last 12 entries",
    recentEmpty: "No accruals yet. Quiver computes the previous week's interest every Monday 02:00 UTC.",
    recentColPeriod: "Period",
    recentColEarnings: "Gross interest",
    recentColFee: "Fee",
    recentColStatus: "Status",
    statusLabel: {
      ACCRUED: "Pending",
      PAID: "Paid",
      WAIVED: "Waived",
    },
    premiumUpsellTitle: "Want to skip the buffer dance?",
    premiumUpsellBody:
      "Premium monthly subscription = 0% perf fee. One flat amount, no buffer to track, no multi-week arrears.",
    premiumUpsellCta: "About Premium →",
    alwaysFree: "Free forever on Friend tier",
  },
  ja: {
    title: "Quiver プラットフォームフィー",
    subtitlePublic: (pct) =>
      `利息収入から ${pct}% のパフォーマンスフィーを徴収。Quiver は Bitfinex の出金権限を持たないため、フィーは Quiver wallet 残高から差し引かれます — バッファを保って延滞を回避してください。`,
    subtitleFriend:
      "あなたは Friend ティア — パフォーマンスフィーなし。下記履歴が空なのが正常です。早期サポート感謝 🙇",
    subtitlePremium:
      "Premium 購読中 — 0% パフォーマンスフィー、今期は accrual なし。履歴のみ表示。",
    exemptFriendBadge: "Friend · 0% 永久無料",
    exemptPremiumBadge: "Premium · 購読中",
    pendingLabel: "未徴収フィー",
    pendingCount: (n) => `${n} 件の ACCRUED`,
    noPending: "保留中なし",
    walletLabel: "Quiver wallet 残高",
    walletInsufficient: "⚠ 次回徴収に不足",
    walletOk: "✓ 次回徴収可能",
    bufferWarningTitle: "バッファ不足",
    bufferWarningBody: (shortfall) =>
      `次回月曜 02:00 UTC の結算で Quiver wallet 残高が不足します($${shortfall} 不足)。差額は ACCRUED として次回再試行されますが、複数週連続未払いで auto-lend が一時停止される可能性があります。今すぐチャージを推奨。`,
    bufferTopupCta: "Quiver wallet にチャージ",
    pausedTitle: "Auto-lend は Quiver により一時停止されました",
    pausedBody: (amt, n) =>
      `${n} 週分 合計 $${amt} の未払いがあります。Quiver は auto-lend を自動的に一時停止しました(既存の貸出ポジションは影響なし、満期で funding wallet に自然に戻ります)。Quiver wallet を $${amt}+ にチャージすると次回月曜 cron で自動再開します;または Premium にアップグレードして 0% パフォーマンスフィーへ。`,
    pausedTopupCta: "Quiver wallet にチャージ",
    pausedPremiumCta: "Premium にアップグレード",
    paid30dLabel: "30 日間支払済",
    paidLifetimeLabel: "累計支払済",
    nextSettleLabel: "次回結算",
    nextSettleHint: "毎週月曜 02:00 UTC に cron 実行",
    recentTitle: "直近 12 件",
    recentEmpty: "まだ accrual はありません。Quiver は毎週月曜 02:00 UTC に前週の利息を計算します。",
    recentColPeriod: "期間",
    recentColEarnings: "総利息",
    recentColFee: "フィー",
    recentColStatus: "状態",
    statusLabel: {
      ACCRUED: "未徴収",
      PAID: "支払済",
      WAIVED: "免除",
    },
    premiumUpsellTitle: "バッファ管理を省きたい?",
    premiumUpsellBody:
      "Premium 月額購読 = 0% パフォーマンスフィー。固定額でバッファ追跡不要、複数週延滞も心配なし。",
    premiumUpsellCta: "Premium について →",
    alwaysFree: "Friend ティアは永久無料",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtUsd(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtBpsAsPct(bps: number): string {
  return (bps / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  // YYYY-MM-DD as-is — no localized formatting needed for a compact table cell
  return iso.split("T")[0];
}

function fmtDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

export function FeeStatusCard({
  locale,
  fees,
}: {
  locale: string;
  fees: EarnFeeSummaryOut;
}) {
  const s = STRINGS[pickLocale(locale)];
  const isFriendExempt = fees.perf_fee_bps === 0 && !fees.is_premium;
  const isPremium = fees.is_premium;
  const showFullCard = !isFriendExempt && !isPremium;
  const pending = Number(fees.pending_accrued_usdt);
  const wallet = Number(fees.quiver_wallet_balance_usdt);
  const shortfall = Math.max(0, pending - wallet);

  // ─── Friend tier (and not premium): show a slim exemption pill, no table ───
  if (isFriendExempt) {
    return (
      <Card className="border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardHeader className="flex-row items-start gap-3">
          <Sparkles className="h-5 w-5 flex-none text-emerald-600" />
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {s.title}
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {s.exemptFriendBadge}
              </span>
            </CardTitle>
            <CardDescription>{s.subtitleFriend}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // ─── Premium: exemption pill + (collapsed) lifetime number for transparency ───
  if (isPremium) {
    return (
      <Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardHeader className="flex-row items-start gap-3">
          <Crown className="h-5 w-5 flex-none text-amber-600" />
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {s.title}
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {s.exemptPremiumBadge}
              </span>
            </CardTitle>
            <CardDescription>{s.subtitlePremium}</CardDescription>
          </div>
        </CardHeader>
        {Number(fees.paid_lifetime_usdt) > 0 ? (
          <CardContent className="text-xs text-slate-500 dark:text-slate-400">
            {s.paidLifetimeLabel}: <span className="font-mono">${fmtUsd(fees.paid_lifetime_usdt)}</span>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  // ─── Public tier (paying user): full card ───
  if (!showFullCard) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-slate-500" />
          {s.title}
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            {fmtBpsAsPct(fees.perf_fee_bps)}%
          </span>
        </CardTitle>
        <CardDescription>{s.subtitlePublic(fmtBpsAsPct(fees.perf_fee_bps))}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* F-5b-2 paused banner — strongest signal, shown when Quiver has
            already taken action (auto-lend off). Includes both top-up and
            Premium escape hatches. */}
        {fees.dunning_level === "paused" ? (
          <div className="rounded-lg border border-red-300 bg-red-50/70 p-3 dark:border-red-800 dark:bg-red-950/40">
            <div className="flex items-start gap-2">
              <PauseCircle className="h-4 w-4 flex-none text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-800 dark:text-red-200">
                  {s.pausedTitle}
                </div>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                  {s.pausedBody(fmtUsd(fees.pending_accrued_usdt), fees.pending_count)}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link
                    href={`/${locale}/wallet`}
                    className="font-medium text-red-700 hover:underline dark:text-red-300"
                  >
                    {s.pausedTopupCta} →
                  </Link>
                  <Link
                    href={`/${locale}/subscription`}
                    className="font-medium text-amber-700 hover:underline dark:text-amber-300"
                  >
                    {s.pausedPremiumCta} →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : fees.has_buffer_warning ? (
          /* Buffer warning (level=warning, 2-3 unpaid weeks) — softer
             amber, no Quiver action taken yet. */
          <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-none text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {s.bufferWarningTitle}
                </div>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                  {s.bufferWarningBody(fmtUsd(shortfall.toFixed(2)))}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* KPI row: pending / wallet / paid 30d / paid lifetime */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label={s.pendingLabel}
            value={`$${fmtUsd(fees.pending_accrued_usdt)}`}
            sub={fees.pending_count > 0 ? s.pendingCount(fees.pending_count) : s.noPending}
            tone={pending > 0 ? "amber" : "slate"}
          />
          <Kpi
            label={s.walletLabel}
            value={`$${fmtUsd(fees.quiver_wallet_balance_usdt)}`}
            sub={
              pending > wallet && pending > 0
                ? s.walletInsufficient
                : pending > 0
                  ? s.walletOk
                  : ""
            }
            tone={pending > wallet && pending > 0 ? "amber" : "slate"}
          />
          <Kpi
            label={s.paid30dLabel}
            value={`$${fmtUsd(fees.paid_30d_usdt)}`}
            tone="slate"
          />
          <Kpi
            label={s.paidLifetimeLabel}
            value={`$${fmtUsd(fees.paid_lifetime_usdt)}`}
            tone="slate"
          />
        </div>

        {/* Next settlement timestamp */}
        <div className="flex items-center justify-between rounded-md border border-cream-edge bg-paper px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/30">
          <div>
            <div className="text-slate-500">{s.nextSettleLabel}</div>
            <div className="font-mono">{fmtDateTime(fees.next_settle_at, locale)}</div>
          </div>
          <div className="text-right text-[10px] text-slate-400">{s.nextSettleHint}</div>
        </div>

        {/* Recent accruals table */}
        <div>
          <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            {s.recentTitle}
          </div>
          {fees.recent_accruals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-cream-edge px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
              {s.recentEmpty}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-cream-edge text-left text-slate-500 dark:border-slate-700">
                    <th className="py-1.5 pr-2">{s.recentColPeriod}</th>
                    <th className="py-1.5 px-2 text-right">{s.recentColEarnings}</th>
                    <th className="py-1.5 px-2 text-right">{s.recentColFee}</th>
                    <th className="py-1.5 pl-2 text-right">{s.recentColStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.recent_accruals.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-cream-edge/50 dark:border-slate-800"
                    >
                      <td className="py-1.5 pr-2 font-mono text-[11px]">
                        {fmtDate(row.period_start)} → {fmtDate(row.period_end)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        ${fmtUsd(row.earnings_amount)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        ${fmtUsd(row.fee_amount)}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <StatusPill status={row.status} label={s.statusLabel[row.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Premium upsell — passive nudge for paying users */}
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <Crown className="h-4 w-4 flex-none text-amber-600" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {s.premiumUpsellTitle}
              </div>
              <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                {s.premiumUpsellBody}
              </p>
              <Link
                href={`/${locale}/subscription`}
                className="mt-1 inline-block text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
              >
                {s.premiumUpsellCta}
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "amber" | "slate";
}) {
  return (
    <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "slate" && "text-slate-700 dark:text-slate-200",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10px] text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: FeeAccrualStatus;
  label: string;
}) {
  const cls =
    status === "PAID"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "WAIVED"
        ? "bg-slate-500/15 text-slate-600 dark:text-slate-400"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  const Icon = status === "PAID" ? CheckCircle2 : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        cls,
      )}
    >
      {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
      {label}
    </span>
  );
}
