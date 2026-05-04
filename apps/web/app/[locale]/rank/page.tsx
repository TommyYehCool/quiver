/**
 * F-5a-4.3 — Public Quiver leaderboard.
 *
 * Designed to be screenshot-friendly so users sharing in Telegram channels
 * have a clean visual. Top 3 get gold/silver/bronze medals; rest is a tight
 * table. Anonymized handles for users who haven't opted in.
 *
 * No auth required. Discoverable via:
 *   - Sidebar nav (logged-in users)
 *   - Direct URL share (Telegram screenshots)
 *   - Future: link from /earn pre-login state
 */

import Link from "next/link";
import { ArrowLeft, Crown, Trophy } from "lucide-react";

import { fetchEarnRankServer } from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Locale = "zh-TW" | "en" | "ja";

interface PageStrings {
  back: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  daysActiveLabel: (n: number) => string;
  premiumBadge: string;
  emptyTitle: string;
  emptyBody: (minDays: number) => string;
  qualifiedFooter: (count: number) => string;
  howToQualifyTitle: string;
  howToQualifySteps: string[];
  ctaLink: string;
  loadFailed: string;
}

const STRINGS: Record<Locale, PageStrings> = {
  "zh-TW": {
    back: "回 Quiver",
    title: "Quiver 排行榜",
    subtitle: "過去 30 天加權 APR 排名 · 即時 Bitfinex 資料",
    metricLabel: "30 天平均 APR",
    daysActiveLabel: (n) => `${n} 天有資料`,
    premiumBadge: "Premium",
    emptyTitle: "等待第一個合格用戶上榜",
    emptyBody: (n) => `至少要有 ${n} 天的 snapshot 才會列入。Quiver 還在收第一批資料,過幾天再回來看。`,
    qualifiedFooter: (count) =>
      count > 0
        ? `共 ${count} 位用戶合格 · 顯示前 20 名`
        : "目前 0 位用戶合格",
    howToQualifyTitle: "想上榜?",
    howToQualifySteps: [
      "1. 連接 Bitfinex 開始 auto-lend(/earn/bot-settings)",
      "2. 累積至少 1 天 snapshot(每日 cron 自動)",
      "3. 綁定 Telegram + opt-in 顯示 username,從 Anonymous 升級為 @你的TG名",
    ],
    ctaLink: "→ 前往 Earn 開始",
    loadFailed: "載入失敗,請稍後再試。",
  },
  en: {
    back: "Back to Quiver",
    title: "Quiver Leaderboard",
    subtitle: "30-day weighted APR ranking · Live Bitfinex data",
    metricLabel: "30-day avg APR",
    daysActiveLabel: (n) => `${n} day${n === 1 ? "" : "s"} of data`,
    premiumBadge: "Premium",
    emptyTitle: "Waiting for the first qualified user",
    emptyBody: (n) =>
      `Minimum ${n} day${n === 1 ? "" : "s"} of snapshot required. Quiver is still collecting initial data — check back in a few days.`,
    qualifiedFooter: (count) =>
      count > 0
        ? `${count} qualified user${count === 1 ? "" : "s"} · Showing top 20`
        : "0 qualified users yet",
    howToQualifyTitle: "Want to be on the leaderboard?",
    howToQualifySteps: [
      "1. Connect Bitfinex and start auto-lend (/earn/bot-settings)",
      "2. Accumulate at least 1 day of snapshot data (daily cron)",
      "3. Bind Telegram + opt-in to show username — upgrade from Anonymous to @your_handle",
    ],
    ctaLink: "→ Get started on Earn",
    loadFailed: "Failed to load, please try again later.",
  },
  ja: {
    back: "Quiver に戻る",
    title: "Quiver リーダーボード",
    subtitle: "過去 30 日の加重 APR ランキング · Bitfinex リアルタイムデータ",
    metricLabel: "30 日平均 APR",
    daysActiveLabel: (n) => `${n} 日分のデータ`,
    premiumBadge: "Premium",
    emptyTitle: "最初の対象ユーザーを待機中",
    emptyBody: (n) =>
      `最低 ${n} 日のスナップショットが必要。Quiver は最初のデータを収集中 — 数日後に再度確認してください。`,
    qualifiedFooter: (count) =>
      count > 0
        ? `${count} 人の対象ユーザー · 上位 20 人表示`
        : "対象ユーザー 0 人",
    howToQualifyTitle: "リーダーボードに載りたい?",
    howToQualifySteps: [
      "1. Bitfinex に接続して auto-lend を開始 (/earn/bot-settings)",
      "2. 最低 1 日分のスナップショットを蓄積(日次 cron)",
      "3. Telegram にバインド + username 表示を opt-in — Anonymous から @username にアップグレード",
    ],
    ctaLink: "→ Earn を始める",
    loadFailed: "読み込みに失敗しました。後ほど再度お試しください。",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtPct(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rankBadge(rank: number): { emoji: string | null; tone: string } {
  if (rank === 1) {
    return {
      emoji: "🥇",
      tone: "border-amber-300/60 bg-amber-50/80 dark:border-amber-700/60 dark:bg-amber-950/40",
    };
  }
  if (rank === 2) {
    return {
      emoji: "🥈",
      tone: "border-slate-300/60 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-900/40",
    };
  }
  if (rank === 3) {
    return {
      emoji: "🥉",
      tone: "border-orange-300/60 bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/30",
    };
  }
  return { emoji: null, tone: "" };
}

export default async function RankPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];
  const rank = await fetchEarnRankServer();

  if (rank === null) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {s.loadFailed}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = rank.entries.length === 0;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-8">
      {/* Back link (visible-but-discreet for users who arrive via deep link) */}
      <Link
        href={`/${locale}`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Trophy className="h-6 w-6 text-amber-700 dark:text-amber-400" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {s.title}
          </h1>
          <p className="text-sm text-slate-500">{s.subtitle}</p>
        </div>
      </div>

      {/* Leaderboard */}
      {isEmpty ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{s.emptyTitle}</CardTitle>
            <CardDescription>{s.emptyBody(rank.min_days_threshold)}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 py-4">
            {rank.entries.map((entry) => {
              const { emoji, tone } = rankBadge(entry.rank);
              const isTop3 = entry.rank <= 3;
              return (
                <div
                  key={entry.rank}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
                    tone || "border-cream-edge bg-paper dark:border-slate-700 dark:bg-slate-900/30",
                    isTop3 && "py-4",
                  )}
                >
                  {/* Rank number / medal */}
                  <div
                    className={cn(
                      "flex w-12 flex-none items-center justify-center font-mono font-bold tabular-nums",
                      isTop3 ? "text-2xl" : "text-base text-slate-500",
                    )}
                  >
                    {emoji ?? `#${entry.rank}`}
                  </div>

                  {/* Display name + premium badge + days active */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate font-mono text-sm",
                          entry.is_anonymous
                            ? "text-slate-500 dark:text-slate-400"
                            : "font-medium text-slate-800 dark:text-slate-100",
                        )}
                      >
                        {entry.display_name}
                      </span>
                      {entry.is_premium ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                          title={s.premiumBadge}
                        >
                          <Crown className="h-2.5 w-2.5" />
                          {s.premiumBadge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {s.daysActiveLabel(entry.days_active)}
                    </div>
                  </div>

                  {/* APR — the big number */}
                  <div className="flex-none text-right">
                    <div
                      className={cn(
                        "font-mono font-bold tabular-nums",
                        isTop3
                          ? "text-2xl text-emerald-600 dark:text-emerald-400"
                          : "text-lg text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {fmtPct(entry.apr_30d_pct)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      {s.metricLabel}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Footer count */}
            <div className="pt-2 text-center text-xs text-slate-400">
              {s.qualifiedFooter(rank.total_qualified_count)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* How to qualify */}
      <Card className="border-emerald-200/40 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/15">
        <CardHeader>
          <CardTitle className="text-base">{s.howToQualifyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
          {s.howToQualifySteps.map((step, i) => (
            <div key={i}>{step}</div>
          ))}
          <div className="pt-1">
            <Link
              href={`/${locale}/earn`}
              className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              {s.ctaLink}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
