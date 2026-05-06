/**
 * /referral/invitees — F-5b-X.3 standalone page for the per-invitee
 * progress + commission history view.
 *
 * Lifted out of the main /referral page (which was getting crowded
 * with both "settings" — your code + bind a referrer — and "results"
 * — invitees + payouts). This page focuses entirely on results, with
 * a back-link to the main referral page for changing settings.
 *
 * Data is fetched server-side and passed down (no client-side fetch),
 * matching the SSR pattern of the parent page.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt, Users } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import {
  fetchReferralInviteesServer,
  fetchReferralPayoutsServer,
} from "@/lib/api/referral-server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteesList } from "@/components/referral/invitees-list";
import { PayoutsTable } from "@/components/referral/payouts-table";

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<
  Locale,
  {
    back: string;
    title: string;
    subtitle: string;
    payouts: {
      title: string;
      desc: string;
      empty: string;
      date: string;
      level: string;
      amount: string;
      l1: string;
      l2: string;
    };
    loadFailed: string;
  }
> = {
  "zh-TW": {
    back: "返回推薦",
    title: "邀請清單",
    subtitle: "你邀請的用戶進度，以及從他們身上獲得的分潤明細。",
    payouts: {
      title: "撥款紀錄",
      desc: "你收到的所有 L1 + L2 分潤明細，最近 100 筆。",
      empty: "還沒有撥款紀錄，等你的被邀請人開始產生績效費才會有。",
      date: "時間",
      level: "層級",
      amount: "金額 (USDT)",
      l1: "L1 直邀",
      l2: "L2 間接",
    },
    loadFailed: "載入失敗,請稍後再試。",
  },
  en: {
    back: "Back to Referral",
    title: "Invitee list",
    subtitle: "Onboarding progress of users you've invited, plus the commission you've received from each.",
    payouts: {
      title: "Payout history",
      desc: "All L1 + L2 revshare you've received, most recent 100.",
      empty: "No payouts yet. They'll appear once your invitees start generating performance fees.",
      date: "Date",
      level: "Level",
      amount: "Amount (USDT)",
      l1: "L1 direct",
      l2: "L2 indirect",
    },
    loadFailed: "Failed to load. Please try again later.",
  },
  ja: {
    back: "リファラルに戻る",
    title: "招待リスト",
    subtitle: "招待した users の進捗と、彼らから獲得したコミッションの内訳。",
    payouts: {
      title: "支払い履歴",
      desc: "受け取った L1 + L2 すべてのレベニューシェア(最新 100 件)。",
      empty: "まだ支払いがありません。招待者がパフォーマンスフィーを発生させると表示されます。",
      date: "日付",
      level: "レベル",
      amount: "金額 (USDT)",
      l1: "L1 直接",
      l2: "L2 間接",
    },
    loadFailed: "読み込みに失敗しました。後ほど再試行してください。",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export default async function InviteesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const [invitees, payouts] = await Promise.all([
    fetchReferralInviteesServer(cookieHeader),
    fetchReferralPayoutsServer(cookieHeader),
  ]);
  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/referral`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {s.back}
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
          <Users className="h-6 w-6 text-rose-700" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {s.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
        </div>
      </div>

      {/* Invitees */}
      <Card>
        <CardContent className="py-6">
          <InviteesList
            invitees={invitees?.invitees ?? []}
            totalCommissionUsdt={invitees?.total_commission_l1_usdt ?? "0"}
            locale={locale}
          />
        </CardContent>
      </Card>

      {/* Payouts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-400" />
            {s.payouts.title}
          </CardTitle>
          <CardDescription>{s.payouts.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutsTable items={payouts?.items ?? []} strings={s.payouts} />
        </CardContent>
      </Card>
    </div>
  );
}
