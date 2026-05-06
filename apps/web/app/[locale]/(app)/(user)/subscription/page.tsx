import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Crown, Check, AlertTriangle } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import {
  fetchSubscriptionMeServer,
  fetchSubscriptionPaymentsServer,
} from "@/lib/api/subscription-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CancelButton,
  SubscribeButton,
  UncancelButton,
} from "@/components/subscription/action-buttons";
import { PaymentsTable } from "@/components/subscription/payments-table";
import type { SubscriptionStateOut } from "@/lib/api/subscription";

type Locale = "zh-TW" | "en" | "ja";

const STRINGS = {
  "zh-TW": {
    title: "Premium 訂閱",
    subtitle: "訂閱後績效費變 0%。所有未來放貸利息全部歸你。",
    plan: {
      title: "Premium 月費方案",
      desc: "$9.99 USDT / 月，績效費全免。隨時可取消,當期結束失效。",
      bullet1: "✓ 0% 績效費(取代 5% / 15% 級距)",
      bullet2: (days: number) => `✓ ${days} 天為一期，自動從你 Quiver 主錢包扣款`,
      bullet3: (days: number) => `✓ 餘額不足會 PAST_DUE 寬限 ${days} 天再失效`,
      bullet4: "✓ 取消後仍可享受到當期結束",
    },
    notSubscribed: {
      ctaTemplate: "訂閱：${price} USDT / 月",
      ctaNote: "立即從你 Quiver 主錢包扣款，確認後即享 0% 績效費。",
    },
    activeSection: {
      titleActive: "Premium 訂閱中 ✓",
      titlePastDue: "Premium 訂閱(扣款失敗中)",
      titleScheduled: "Premium 訂閱中(已排程取消)",
      activeDesc: (renewDate: string) =>
        `下次自動續訂時間:${renewDate}。隨時可取消(到期後失效,不退費)。`,
      pastDueDesc: (graceEnd: string) =>
        `上次自動續訂扣款失敗,主錢包餘額不足。請於 ${graceEnd} 前儲值,否則訂閱會自動到期。`,
      scheduledDesc: (endDate: string) =>
        `已排程取消,${endDate} 後失效,績效費將恢復為一般級距。要繼續訂閱?點下面復原。`,
      cancelCta: "取消訂閱(保留到期)",
      uncancelCta: "復原(繼續續訂)",
      premiumBadgePeriod: (start: string, end: string) =>
        `當期:${start} – ${end}`,
    },
    payments: {
      title: "扣款紀錄",
      desc: "包含成功與失敗的所有 attempt。",
      empty: "還沒有扣款紀錄。",
      date: "時間",
      period: "覆蓋期間",
      amount: "金額 (USDT)",
      status: "狀態",
      paid: "已扣款",
      failed: "失敗",
      failureInsufficient: "餘額不足",
    },
    actionErrors: {
      "subscription.alreadyActive": "你已經是訂閱用戶了",
      "subscription.insufficientBalance":
        "Quiver 主錢包餘額不足 $9.99 USDT,請先儲值",
      "subscription.notActive": "目前沒有 active 訂閱",
      "subscription.notCancelled": "你的訂閱沒有排程取消,不需要復原",
      "subscription.unknown": "操作失敗,請稍後再試",
    },
  },
  en: {
    title: "Premium Subscription",
    subtitle: "Subscribe to skip the performance fee. Keep 100% of your future lending interest.",
    plan: {
      title: "Premium monthly plan",
      desc: "$9.99 USDT / month, 0% performance fee. Cancel anytime, benefits stay until period end.",
      bullet1: "✓ 0% performance fee (instead of the 5% / 15% tier rate)",
      bullet2: (days: number) =>
        `✓ ${days}-day period, auto-debited from your Quiver main wallet`,
      bullet3: (days: number) =>
        `✓ ${days}-day grace if your balance is short before the sub expires`,
      bullet4: "✓ Cancel keeps benefits until period end",
    },
    notSubscribed: {
      ctaTemplate: "Subscribe: ${price} USDT / month",
      ctaNote: "Charged immediately from your Quiver main wallet. 0% performance fee starts on confirmation.",
    },
    activeSection: {
      titleActive: "Premium active ✓",
      titlePastDue: "Premium (renewal failing)",
      titleScheduled: "Premium active (cancellation scheduled)",
      activeDesc: (renewDate: string) =>
        `Next auto-renewal: ${renewDate}. You can cancel anytime; benefits stay until period end (no refund).`,
      pastDueDesc: (graceEnd: string) =>
        `Last renewal attempt failed (insufficient main-wallet balance). Top up before ${graceEnd} or the subscription expires.`,
      scheduledDesc: (endDate: string) =>
        `Cancellation scheduled. Expires ${endDate}; performance fee returns to your tier rate. Want to keep going? Click resume below.`,
      cancelCta: "Cancel (keep until period end)",
      uncancelCta: "Resume (continue renewing)",
      premiumBadgePeriod: (start: string, end: string) =>
        `Current period: ${start} – ${end}`,
    },
    payments: {
      title: "Billing history",
      desc: "Both successful and failed attempts.",
      empty: "No billing history yet.",
      date: "Date",
      period: "Period covered",
      amount: "Amount (USDT)",
      status: "Status",
      paid: "Paid",
      failed: "Failed",
      failureInsufficient: "insufficient balance",
    },
    actionErrors: {
      "subscription.alreadyActive": "You already have an active subscription",
      "subscription.insufficientBalance":
        "Your Quiver main-wallet balance is below $9.99 USDT. Please top up first.",
      "subscription.notActive": "No active subscription to act on",
      "subscription.notCancelled":
        "Your subscription is not scheduled for cancellation",
      "subscription.unknown": "Operation failed, please try again later",
    },
  },
  ja: {
    title: "Premium サブスクリプション",
    subtitle: "サブスク登録でパフォーマンスフィーは 0%。今後の貸出利息をすべて自分のものに。",
    plan: {
      title: "Premium 月額プラン",
      desc: "$9.99 USDT / 月、パフォーマンスフィー 完全無料。いつでもキャンセル可能、特典は当期終了まで継続。",
      bullet1: "✓ 0% パフォーマンスフィー(5% / 15% のティアレートを置き換え)",
      bullet2: (days: number) =>
        `✓ ${days} 日サイクル、Quiver メインウォレットから自動引落`,
      bullet3: (days: number) =>
        `✓ 残高不足時は PAST_DUE で ${days} 日間の猶予`,
      bullet4: "✓ キャンセル後も当期終了まで利用可能",
    },
    notSubscribed: {
      ctaTemplate: "サブスク登録：${price} USDT / 月",
      ctaNote: "即時に Quiver メインウォレットから引落。確認後 0%パフォーマンスフィー開始。",
    },
    activeSection: {
      titleActive: "Premium 登録中 ✓",
      titlePastDue: "Premium(自動更新失敗中)",
      titleScheduled: "Premium 登録中(キャンセル予約済み)",
      activeDesc: (renewDate: string) =>
        `次回自動更新:${renewDate}。いつでもキャンセル可能(当期終了まで継続、返金なし)。`,
      pastDueDesc: (graceEnd: string) =>
        `前回の自動更新が失敗しました(残高不足)。${graceEnd} までに入金してください、それ以外はサブスクが期限切れになります。`,
      scheduledDesc: (endDate: string) =>
        `キャンセル予約済み。${endDate} に失効、パフォーマンスフィー はティアレートに戻ります。続行する場合は下の復元をクリック。`,
      cancelCta: "キャンセル(当期まで継続)",
      uncancelCta: "復元(自動更新継続)",
      premiumBadgePeriod: (start: string, end: string) =>
        `当期:${start} – ${end}`,
    },
    payments: {
      title: "支払い履歴",
      desc: "成功と失敗の全試行を含みます。",
      empty: "まだ支払い記録はありません。",
      date: "日時",
      period: "対象期間",
      amount: "金額 (USDT)",
      status: "ステータス",
      paid: "支払済",
      failed: "失敗",
      failureInsufficient: "残高不足",
    },
    actionErrors: {
      "subscription.alreadyActive": "既にアクティブなサブスクリプションがあります",
      "subscription.insufficientBalance":
        "Quiver メインウォレットの残高が $9.99 USDT 未満です。先に入金してください。",
      "subscription.notActive": "アクティブなサブスクリプションがありません",
      "subscription.notCancelled": "サブスクリプションはキャンセル予定ではありません",
      "subscription.unknown": "操作失敗、後ほど再試行してください",
    },
  },
} as const;

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// Explicit wide type — using `(typeof STRINGS)["zh-TW"]["activeSection"]` would
// narrow to literal string types from `as const` and reject other locales' values.
interface ActiveSectionStrings {
  titleActive: string;
  titlePastDue: string;
  titleScheduled: string;
  activeDesc: (renewDate: string) => string;
  pastDueDesc: (graceEnd: string) => string;
  scheduledDesc: (endDate: string) => string;
  cancelCta: string;
  uncancelCta: string;
  premiumBadgePeriod: (start: string, end: string) => string;
}

function ActiveStateCard({
  sub,
  graceDays,
  strings,
}: {
  sub: SubscriptionStateOut;
  graceDays: number;
  strings: ActiveSectionStrings;
}) {
  const periodEnd = fmtDate(sub.current_period_end);
  const periodStart = fmtDate(sub.current_period_start);

  if (sub.status === "PAST_DUE" && sub.past_due_since) {
    const graceEnd = new Date(sub.past_due_since);
    graceEnd.setDate(graceEnd.getDate() + graceDays);
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {strings.titlePastDue}
            </p>
            <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-300/80">
              {strings.pastDueDesc(graceEnd.toLocaleDateString())}
            </p>
            <p className="mt-1 text-xs text-amber-700/60 dark:text-amber-300/60">
              {strings.premiumBadgePeriod(periodStart, periodEnd)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (sub.cancel_at_period_end) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
          <Crown className="mt-0.5 h-5 w-5 flex-none text-slate-500" />
          <div className="flex-1">
            <p className="font-medium">{strings.titleScheduled}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {strings.scheduledDesc(periodEnd)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {strings.premiumBadgePeriod(periodStart, periodEnd)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <Check className="mt-0.5 h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
        <div className="flex-1">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            {strings.titleActive}
          </p>
          <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
            {strings.activeDesc(periodEnd)}
          </p>
          <p className="mt-1 text-xs text-emerald-700/60 dark:text-emerald-300/60">
            {strings.premiumBadgePeriod(periodStart, periodEnd)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function SubscriptionPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const me = await fetchSubscriptionMeServer(cookieHeader);
  const payments = await fetchSubscriptionPaymentsServer(cookieHeader);
  const s = STRINGS[pickLocale(locale)];

  if (!me) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Failed to load subscription data.
          </CardContent>
        </Card>
      </div>
    );
  }

  const sub = me.subscription;
  const isActive = sub?.is_currently_active ?? false;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-amber">
          <Crown className="h-6 w-6 text-amber-600" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
          <p className="text-sm text-slate-500">{s.subtitle}</p>
        </div>
      </div>

      {/* Plan card */}
      <Card>
        <CardHeader>
          <CardTitle>{s.plan.title}</CardTitle>
          <CardDescription>{s.plan.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p>{s.plan.bullet1}</p>
          <p>{s.plan.bullet2(me.plan_period_days)}</p>
          <p>{s.plan.bullet3(me.grace_days)}</p>
          <p>{s.plan.bullet4}</p>
        </CardContent>
      </Card>

      {/* Action card — varies by sub state */}
      {isActive && sub ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <ActiveStateCard sub={sub} graceDays={me.grace_days} strings={s.activeSection} />
            {sub.cancel_at_period_end ? (
              <UncancelButton
                strings={{
                  subscribeCtaTemplate: "",
                  cancelCta: "",
                  uncancelCta: s.activeSection.uncancelCta,
                  errors: s.actionErrors,
                }}
              />
            ) : sub.status === "ACTIVE" ? (
              <CancelButton
                strings={{
                  subscribeCtaTemplate: "",
                  cancelCta: s.activeSection.cancelCta,
                  uncancelCta: "",
                  errors: s.actionErrors,
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {s.notSubscribed.ctaNote}
            </p>
            <SubscribeButton
              price={Number(me.plan_price_usdt).toFixed(2)}
              strings={{
                subscribeCtaTemplate: s.notSubscribed.ctaTemplate,
                cancelCta: "",
                uncancelCta: "",
                errors: s.actionErrors,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Payments table */}
      <Card>
        <CardHeader>
          <CardTitle>{s.payments.title}</CardTitle>
          <CardDescription>{s.payments.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentsTable items={payments?.items ?? []} strings={s.payments} />
        </CardContent>
      </Card>
    </div>
  );
}
