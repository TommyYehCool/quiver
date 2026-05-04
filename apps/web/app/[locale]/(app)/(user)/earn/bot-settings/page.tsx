import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";

import { fetchMeServer } from "@/lib/auth";
import {
  fetchEarnConnectPreviewServer,
  fetchEarnMeServer,
} from "@/lib/api/earn-user-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectBitfinexForm } from "@/components/earn/connect-bitfinex-form";
import { AutoLendToggle } from "@/components/earn/auto-lend-toggle";
import { CheckCircle2 } from "lucide-react";

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<Locale, {
  back: string;
  title: string;
  subtitle: string;
  // F-5a-1.1: shown when user already has an active Bitfinex connection
  connected: {
    statusTitle: string;
    statusDesc: string;
    fundingAddrLabel: string;
    autoLendTitle: string;
    autoLendDesc: string;
    updateKeyTitle: string;
    updateKeyDesc: string;
  };
  feeCard: {
    titleFriend: string;
    titlePublic: string;
    descFriend: (slotsRemaining: number, total: number) => string;
    descPublic: string;
    feeLabel: string;
    feeNote: string;
  };
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
    title: "放貸機器人設定",
    subtitle: "Bitfinex API key、Funding 入金地址、auto-lend 開關 — 都在這。連接後可隨時更新或撤銷。",
    connected: {
      statusTitle: "已連接 Bitfinex",
      statusDesc: "Quiver 正在用這支 key 自動放貸。要撤銷的話到 Bitfinex 點 Revoke 那支 key 即可。",
      fundingAddrLabel: "Funding 入金地址",
      autoLendTitle: "Auto-lend 自動放貸",
      autoLendDesc: "ON:每筆新存進 Quiver 的 USDT 自動送到你 Bitfinex 並掛 offer。OFF:新 deposit 不進入 Bitfinex(已借出的部位不受影響,自然到期回 funding wallet)。",
      updateKeyTitle: "更新 API key",
      updateKeyDesc: "key 過期或想換一支?重新填表單覆寫即可。舊 key 會自動 revoke。",
    },
    feeCard: {
      titleFriend: "🎉 你會進入 Friend 名額",
      titlePublic: "標準費率",
      descFriend: (remaining, total) =>
        `前 ${total} 名連接者享受 Friend 等級費率。目前還剩 ${remaining} 個名額。`,
      descPublic: "Friend 名額已滿,你會以標準公開費率連接。Quiver 從你利息收入抽取績效費,本金永遠不抽。",
      feeLabel: "績效費(只從你的利息收入扣,本金不動)",
      feeNote: "本金永遠不會被扣手續費。Fee 只在你的部位獲得利息且贖回時計算,從利息總額中抽取上述比例。",
    },
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
    title: "Lending bot settings",
    subtitle: "Your Bitfinex API key, Funding deposit address, and auto-lend toggle — all here. Update or revoke any time after connecting.",
    connected: {
      statusTitle: "Connected to Bitfinex",
      statusDesc: "Quiver is auto-lending with this key. To revoke, head to Bitfinex and click Revoke on the key.",
      fundingAddrLabel: "Funding deposit address",
      autoLendTitle: "Auto-lend",
      autoLendDesc: "ON: every new USDT deposit to Quiver is auto-sent to your Bitfinex and offered out. OFF: new deposits stay in Quiver (existing lent positions are unaffected and roll off naturally on offer expiry).",
      updateKeyTitle: "Update API key",
      updateKeyDesc: "Key expired or want to rotate? Just fill the form again — the old key is automatically revoked.",
    },
    feeCard: {
      titleFriend: "🎉 You'll get the Friend rate",
      titlePublic: "Standard rate",
      descFriend: (remaining, total) =>
        `The first ${total} connectors get the Friend tier rate. ${remaining} slot${remaining === 1 ? "" : "s"} remaining.`,
      descPublic: "All Friend slots are taken — you'll connect at the standard public rate. Quiver takes a performance fee from your interest income only; never from your principal.",
      feeLabel: "Performance fee (charged from interest only — never principal)",
      feeNote: "Your principal is never charged. The fee is calculated only when your position earns interest and you redeem, taking the above percentage from gross interest.",
    },
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
    title: "貸付ボット設定",
    subtitle: "Bitfinex API キー、Funding 入金アドレス、auto-lend トグル — すべてここに。接続後はいつでも更新・取消可能。",
    connected: {
      statusTitle: "Bitfinex 接続済み",
      statusDesc: "Quiver はこのキーで自動貸付を実行中。取り消すには Bitfinex でこのキーを Revoke してください。",
      fundingAddrLabel: "Funding 入金アドレス",
      autoLendTitle: "Auto-lend 自動貸付",
      autoLendDesc: "ON:Quiver への新規 USDT 入金は自動で Bitfinex に送られ offer が出ます。OFF:新規入金は Quiver に留まり、Bitfinex には送られません(既存の貸出ポジションは影響を受けず、満期時に funding wallet に自然に戻ります)。",
      updateKeyTitle: "API キーを更新",
      updateKeyDesc: "キーが期限切れ?ローテーションしたい?フォームを再入力するだけで、古いキーは自動的に revoke されます。",
    },
    feeCard: {
      titleFriend: "🎉 Friend 枠に入れます",
      titlePublic: "標準レート",
      descFriend: (remaining, total) =>
        `先着 ${total} 名が Friend ティアのレートを利用できます。残り ${remaining} 枠。`,
      descPublic: "Friend 枠は埋まっており、標準の public レートで接続されます。Quiver は元本ではなく利息収入からのみパフォーマンス手数料を取ります。",
      feeLabel: "パフォーマンス手数料(償還時、利息のみから差引)",
      feeNote: "元本に手数料がかかることはありません。手数料はポジションが利息を得て償還するときのみ計算され、利息総額から上記のパーセンテージが差し引かれます。",
    },
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
  if (earn.kyc_status !== "APPROVED") {
    redirect(`/${locale}/earn`);
  }
  // F-5a-1.1: connected users CAN visit bot-settings (update keys, toggle
  // auto-lend, view permissions). Old behavior redirected to /earn.

  const preview = await fetchEarnConnectPreviewServer(cookieHeader);
  const s = STRINGS[pickLocale(locale)];
  const isConnected = earn.bitfinex_connected;

  // Permission diagram (right column on desktop, below form on mobile).
  // Rendered as JSX block so we can drop into both paths cleanly.
  const permissionsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{s.checklist.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div>
          <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
            {s.checklist.yes}
          </div>
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
              <strong>{s.checklist.noEmphasized}</strong>
              {s.checklist.noEmphasizedSuffix}
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
  );

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-6">
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

      {/* Two-column layout on desktop: settings/form on left, perms diagram
          on right (FULY-style). Stacks on mobile. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {isConnected ? (
            <>
              {/* Connected status */}
              <Card className="border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
                <CardHeader className="flex-row items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1">
                    <CardTitle className="text-base">{s.connected.statusTitle}</CardTitle>
                    <CardDescription>{s.connected.statusDesc}</CardDescription>
                  </div>
                </CardHeader>
                {earn.bitfinex_funding_address ? (
                  <CardContent>
                    <div className="text-xs uppercase tracking-wider text-slate-500">
                      {s.connected.fundingAddrLabel}
                    </div>
                    <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-xs dark:bg-slate-800">
                      {earn.bitfinex_funding_address}
                    </code>
                  </CardContent>
                ) : null}
              </Card>

              {/* Auto-lend toggle */}
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-base">{s.connected.autoLendTitle}</CardTitle>
                    <CardDescription>{s.connected.autoLendDesc}</CardDescription>
                  </div>
                  <AutoLendToggle initial={earn.auto_lend_enabled} />
                </CardHeader>
              </Card>
            </>
          ) : (
            // First-time: fee preview + guide card up top
            <>
              {preview ? (
                <Card
                  className={
                    preview.tier === "friend"
                      ? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                      : "border-slate-300/60 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40"
                  }
                >
                  <CardHeader className="flex-row items-start gap-3">
                    <Sparkles
                      className={
                        preview.tier === "friend"
                          ? "h-5 w-5 flex-none text-emerald-600"
                          : "h-5 w-5 flex-none text-slate-500"
                      }
                    />
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        {preview.tier === "friend"
                          ? s.feeCard.titleFriend
                          : s.feeCard.titlePublic}
                      </CardTitle>
                      <CardDescription>
                        {preview.tier === "friend"
                          ? s.feeCard.descFriend(
                              preview.friend_slots_remaining,
                              preview.friend_slots_total,
                            )
                          : s.feeCard.descPublic}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between rounded-md border border-cream-edge bg-white/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                      <span className="text-xs text-slate-500">{s.feeCard.feeLabel}</span>
                      <span className="text-xl font-semibold tabular-nums">
                        {Number(preview.perf_fee_pct).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {s.feeCard.feeNote}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

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
                    href={`/${locale}/guide/bitfinex-api-key`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {s.guideCard.cta}
                  </Link>
                </CardContent>
              </Card>
            </>
          )}

          {/* Form is always available — also serves as "update key" for
              connected users (the backend revokes the old conn on resubmit). */}
          <Card>
            <CardHeader>
              <CardTitle>
                {isConnected ? s.connected.updateKeyTitle : s.formCard.title}
              </CardTitle>
              <CardDescription>
                {isConnected ? s.connected.updateKeyDesc : s.formCard.desc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectBitfinexForm locale={locale} />
            </CardContent>
          </Card>
        </div>

        {/* Right column — permissions diagram (sticky on desktop) */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {permissionsCard}
        </div>
      </div>
    </div>
  );
}
