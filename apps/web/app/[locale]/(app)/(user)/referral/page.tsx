import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Gift, TrendingUp, Users } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import {
  fetchReferralMeServer,
  fetchReferralPayoutsServer,
} from "@/lib/api/referral-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeSection } from "@/components/referral/code-section";
import { BindSection } from "@/components/referral/bind-section";
import { PayoutsTable } from "@/components/referral/payouts-table";

type Locale = "zh-TW" | "en" | "ja";

const STRINGS = {
  "zh-TW": {
    title: "推薦",
    subtitle: "邀請朋友加入 Quiver Earn,從他們未來 6 個月的績效費賺分潤。",
    statBlocks: {
      directInvitees: "已邀請人數",
      directInviteesSub: "直接被你邀請的用戶",
      totalEarned: "累計分潤",
      totalEarnedSub: "已撥到你 Quiver 主錢包的 USDT",
      payoutsCount: "撥款次數",
      payoutsCountSub: "L1 + L2 加總",
    },
    howItWorks: {
      title: "怎麼運作",
      l1Pct: (pct: string) => `**直邀(L1)**:被你邀請的人每次被收績效費,你拿其中 **${pct}%**`,
      l2Pct: (pct: string) => `**間接(L2)**:被邀請人邀請的下一層,你拿 **${pct}%**`,
      window: (days: number) => `每位被邀請人的分潤窗口為 **${days} 天**,從他們第一筆績效費結算當天起算。`,
      payment: "撥款即時 — 績效費結算當下,自動撥到你的 Quiver 錢包,可直接提領或繼續賺利息。",
      eligibility:
        "⚠️ 分潤產生條件:**你推薦的人必須是標準等級用戶**(預設 15% 績效費),而且當週確實有績效費被扣到。Friend 等級永久 0% 不收費,Premium 訂戶也是 0%,這兩種都不會產生你的分潤。",
    },
    code: {
      haveCodeTitle: "你的推薦碼",
      haveCodeDesc: "把這組碼或下面的連結傳給朋友,他們在連接 Bitfinex 時填入或事後綁定都行。",
      shareLinkLabel: "分享連結",
      copy: "複製",
      copied: "已複製",
      setTitle: "建立你的推薦碼",
      setDesc: "用戶可自選 4-12 字元 [A-Z0-9],一旦設定無法變更(找 admin)。",
      inputLabel: "推薦碼",
      inputPlaceholder: "例如 TOMMY8",
      rules: "4-12 字元,只允許 A-Z 與 0-9。",
      submit: "建立",
      errors: {
        "referral.codeInvalid": "格式錯誤(4-12 字元 [A-Z0-9])",
        "referral.codeReserved": "這個碼是保留字,請換一個",
        "referral.codeTaken": "這個碼已被其他人使用",
        "referral.codeAlreadySet": "你已經設定過推薦碼了",
      },
    },
    bind: {
      alreadyBoundTitle: "你已綁定推薦人",
      alreadyBoundDesc: "你的績效費結算時,會自動撥分潤給你的推薦人。",
      windowActiveTemplate: "分潤窗口開啟中 — 至 {date} 結束。",
      windowExpired: "分潤窗口已過期。",
      windowNotStarted: "分潤窗口尚未開始(等你產生第一筆績效費)。",
      bindTitle: "輸入別人的推薦碼",
      bindDesc: "如果是朋友邀你來的,輸入他們的碼把你綁定。一旦綁定無法變更。",
      inputLabel: "推薦碼",
      inputPlaceholder: "例如 ALICE12",
      submit: "綁定",
      errors: {
        "referral.codeInvalid": "格式錯誤",
        "referral.codeNotFound": "找不到這個推薦碼",
        "referral.selfReferral": "不能綁定自己的推薦碼",
        "referral.alreadyBound": "你已經綁定過推薦人了",
        "referral.cycleDetected": "綁定會造成循環,被擋下",
      },
    },
    payouts: {
      title: "撥款紀錄",
      desc: "你收到的所有 L1 + L2 分潤明細,最近 100 筆。",
      empty: "還沒有撥款紀錄。等你的被邀請人開始產生績效費才會有。",
      date: "時間",
      level: "層級",
      amount: "金額 (USDT)",
      l1: "L1 直邀",
      l2: "L2 間接",
    },
  },
  en: {
    title: "Referral",
    subtitle: "Invite friends to Quiver Earn and earn revshare on their performance fees for 6 months.",
    statBlocks: {
      directInvitees: "Direct invitees",
      directInviteesSub: "People you've invited directly",
      totalEarned: "Total earned",
      totalEarnedSub: "USDT credited to your Quiver wallet",
      payoutsCount: "Payouts",
      payoutsCountSub: "L1 + L2 combined",
    },
    howItWorks: {
      title: "How it works",
      l1Pct: (pct: string) => `**Direct (L1)**: every time someone you invited is charged a performance fee, you receive **${pct}%**`,
      l2Pct: (pct: string) => `**Indirect (L2)**: people invited by your invitees pay **${pct}%** to you`,
      window: (days: number) => `Each invitee's revshare window is **${days} days**, starting from the day their first performance fee settles.`,
      payment: "Real-time — payouts credit to your Quiver wallet the moment a performance fee settles. Withdraw immediately or keep earning interest.",
      eligibility:
        "⚠️ Revshare requires: **your invitee must be on the standard tier** (default 15% performance fee) AND must actually have a performance fee settled that week. Friend tier (0% fee forever) and Premium subscribers (0% fee while subscribed) generate NO revshare events.",
    },
    code: {
      haveCodeTitle: "Your referral code",
      haveCodeDesc: "Share this code or the link below with friends. They can paste it when connecting Bitfinex, or later from this page.",
      shareLinkLabel: "Share link",
      copy: "Copy",
      copied: "Copied",
      setTitle: "Choose your referral code",
      setDesc: "Pick a 4-12 character [A-Z0-9] code. Once set, only an admin can change it.",
      inputLabel: "Code",
      inputPlaceholder: "e.g. TOMMY8",
      rules: "4-12 characters, A-Z and 0-9 only.",
      submit: "Create",
      errors: {
        "referral.codeInvalid": "Invalid format (4-12 chars, [A-Z0-9])",
        "referral.codeReserved": "This code is reserved — please pick another",
        "referral.codeTaken": "This code is already in use",
        "referral.codeAlreadySet": "You already have a referral code",
      },
    },
    bind: {
      alreadyBoundTitle: "You're bound to a referrer",
      alreadyBoundDesc: "When your performance fee settles, your referrer automatically receives revshare.",
      windowActiveTemplate: "Revshare window active — ends {date}.",
      windowExpired: "Revshare window expired.",
      windowNotStarted: "Revshare window hasn't started yet (waiting for your first performance fee).",
      bindTitle: "Paste someone's referral code",
      bindDesc: "If a friend invited you, enter their code to bind. Once bound it cannot be changed.",
      inputLabel: "Code",
      inputPlaceholder: "e.g. ALICE12",
      submit: "Bind",
      errors: {
        "referral.codeInvalid": "Invalid format",
        "referral.codeNotFound": "No such referral code",
        "referral.selfReferral": "Cannot bind to your own code",
        "referral.alreadyBound": "You're already bound to a referrer",
        "referral.cycleDetected": "Binding would create a referral cycle — blocked",
      },
    },
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
  },
  ja: {
    title: "リファラル",
    subtitle: "友達を Quiver Earn に招待し、6 ヶ月間そのパフォーマンスフィーからレベニューシェアを獲得。",
    statBlocks: {
      directInvitees: "直接招待数",
      directInviteesSub: "あなたが直接招待したユーザー",
      totalEarned: "累計獲得",
      totalEarnedSub: "Quiver メインウォレットに振り込まれた USDT",
      payoutsCount: "支払い回数",
      payoutsCountSub: "L1 + L2 合計",
    },
    howItWorks: {
      title: "仕組み",
      l1Pct: (pct: string) => `**直接(L1)**:あなたが招待した人がパフォーマンスフィーを支払うたびに **${pct}%** 受け取り`,
      l2Pct: (pct: string) => `**間接(L2)**:あなたの招待者が招待した次の階層から **${pct}%**`,
      window: (days: number) => `各招待者のレベニューシェア窓口は **${days} 日間**、最初のパフォーマンスフィー決済日から開始。`,
      payment: "リアルタイム支払い —パフォーマンスフィー決済時に自動で Quiver ウォレットに振込。すぐに引き出すか利息運用を続けるか自由。",
      eligibility:
        "⚠️ レベニューシェアの発生条件:**招待した相手が標準ティアのユーザー**(デフォルト 15% パフォーマンスフィー)であり、その週に実際にフィーが決済されたとき。Friend ティア(永久 0%)と Premium 購読者(購読中 0%)はフィーが発生しないため、レベニューシェアも発生しません。",
    },
    code: {
      haveCodeTitle: "あなたのリファラルコード",
      haveCodeDesc: "このコードまたは下のリンクを友達にシェア。Bitfinex 接続時または後からこのページで紐付けできます。",
      shareLinkLabel: "シェアリンク",
      copy: "コピー",
      copied: "コピー済み",
      setTitle: "リファラルコードを作成",
      setDesc: "4-12 文字 [A-Z0-9] を自由に選択。一度設定すると管理者のみ変更可能。",
      inputLabel: "コード",
      inputPlaceholder: "例 TOMMY8",
      rules: "4-12 文字、A-Z および 0-9 のみ。",
      submit: "作成",
      errors: {
        "referral.codeInvalid": "形式エラー(4-12 文字 [A-Z0-9])",
        "referral.codeReserved": "予約済みコードです、別のコードを選んでください",
        "referral.codeTaken": "このコードは既に使用されています",
        "referral.codeAlreadySet": "既にリファラルコードを設定済みです",
      },
    },
    bind: {
      alreadyBoundTitle: "リファラーに紐付け済み",
      alreadyBoundDesc: "あなたのパフォーマンスフィー決済時、リファラーに自動でレベニューシェアが振り込まれます。",
      windowActiveTemplate: "レベニューシェア窓口アクティブ — {date} に終了。",
      windowExpired: "レベニューシェア窓口は期限切れです。",
      windowNotStarted: "レベニューシェア窓口はまだ開始していません(最初のパフォーマンスフィーを待機中)。",
      bindTitle: "他人のリファラルコードを入力",
      bindDesc: "友達に招待された場合、コードを入力して紐付けてください。一度紐付けると変更不可。",
      inputLabel: "コード",
      inputPlaceholder: "例 ALICE12",
      submit: "紐付け",
      errors: {
        "referral.codeInvalid": "形式エラー",
        "referral.codeNotFound": "このリファラルコードが見つかりません",
        "referral.selfReferral": "自分のコードに紐付けはできません",
        "referral.alreadyBound": "既にリファラーに紐付け済みです",
        "referral.cycleDetected": "紐付けるとループが発生するためブロック",
      },
    },
    payouts: {
      title: "支払い履歴",
      desc: "受け取った全 L1 + L2 レベニューシェア、直近 100 件。",
      empty: "まだ支払い記録はありません。招待者がパフォーマンスフィーを発生させると表示されます。",
      date: "日時",
      level: "レベル",
      amount: "金額 (USDT)",
      l1: "L1 直接",
      l2: "L2 間接",
    },
  },
} as const;

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

// Render markdown-light (**bold**) into plain JSX. Tiny inline parser; we don't
// pull in a markdown lib for one symbol.
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default async function ReferralPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const me = await fetchReferralMeServer(cookieHeader);
  const payouts = await fetchReferralPayoutsServer(cookieHeader);
  const s = STRINGS[pickLocale(locale)];

  if (!me) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Failed to load referral data.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalEarned = Number(me.total_earned_usdt);
  const payoutsCount = payouts?.items.length ?? 0;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
          <Gift className="h-6 w-6 text-rose-700" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
          <p className="text-sm text-slate-500">{s.subtitle}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {s.statBlocks.directInvitees}
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{me.direct_referees_count}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">{s.statBlocks.directInviteesSub}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> {s.statBlocks.totalEarned}
            </CardDescription>
            <CardTitle className="font-mono text-2xl text-emerald-600">
              {totalEarned.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">{s.statBlocks.totalEarnedSub}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{s.statBlocks.payoutsCount}</CardDescription>
            <CardTitle className="font-mono text-2xl">{payoutsCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">{s.statBlocks.payoutsCountSub}</CardContent>
        </Card>
      </div>

      {/* How it works */}
      <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="text-base">{s.howItWorks.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{renderBold(s.howItWorks.l1Pct(me.l1_pct))}</p>
          <p>{renderBold(s.howItWorks.l2Pct(me.l2_pct))}</p>
          <p>{renderBold(s.howItWorks.window(me.window_days))}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{s.howItWorks.payment}</p>
          <p className="rounded-md border border-amber-300/60 bg-amber-100/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {renderBold(s.howItWorks.eligibility)}
          </p>
        </CardContent>
      </Card>

      {/* Your code */}
      <Card>
        <CardContent className="py-6">
          <CodeSection
            initialCode={me.code}
            shareUrlTemplate={me.share_url_template}
            strings={s.code}
          />
        </CardContent>
      </Card>

      {/* Bind to a referrer */}
      <Card>
        <CardContent className="py-6">
          <BindSection initialReferrer={me.referrer} strings={s.bind} />
        </CardContent>
      </Card>

      {/* Payouts table */}
      <Card>
        <CardHeader>
          <CardTitle>{s.payouts.title}</CardTitle>
          <CardDescription>{s.payouts.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutsTable items={payouts?.items ?? []} strings={s.payouts} />
        </CardContent>
      </Card>
    </div>
  );
}
