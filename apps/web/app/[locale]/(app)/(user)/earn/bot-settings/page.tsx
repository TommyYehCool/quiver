import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, PauseCircle, Sparkles } from "lucide-react";

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
import { StrategyPresetCard } from "@/components/earn/strategy-preset-card";
import { BitfinexPermissionsMirror } from "@/components/earn/bitfinex-permissions-mirror";
import { TelegramConnectCard } from "@/components/earn/telegram-connect-card";
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
    strategyTitle: string;
    strategyDesc: string;
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
  /** F-5b-2: buffer hint for public-tier users (skipped for Friend/Premium). */
  bufferTip: string;
  /** F-5b-2: shown when earn.dunning_pause_active is true. */
  dunningPaused: { title: string; body: string; topupCta: string; premiumCta: string };
  /** F-5a-4.1: heading for the Telegram connect card section. */
  telegramSection: { title: string; desc: string };
  guideCard: { title: string; desc: string; cta: string };
  formCard: { title: string; desc: string };
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
      strategyTitle: "策略偏好",
      strategyDesc: "選擇放貸風格 — 影響 Quiver 怎麼切分梯隊 (ladder) 與選擇掛單天數。隨時可換,下一次新存入或自動續借生效。",
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
    bufferTip: "💡 建議 Quiver wallet 留 $50+ 作為 fee 預留 — 因為 Quiver 沒有 Bitfinex 提現權限,fee 從你的 Quiver wallet 扣;留 buffer 可避免 4 週連續積欠後 auto-lend 被自動暫停。Premium 訂閱可完全跳過。",
    dunningPaused: {
      title: "Auto-lend 已被 Quiver 暫停(連續 4 週未付 fee)",
      body: "你的 auto-lend 目前被 Quiver 自動暫停 — 即使你下面把 toggle 打開,下個週一 cron 跑完還是會再被暫停。要恢復:儲值 Quiver wallet 補足欠款,或升級 Premium。",
      topupCta: "去儲值 Quiver wallet",
      premiumCta: "升級 Premium →",
    },
    telegramSection: {
      title: "Telegram 通知",
      desc: "綁定 Telegram 後,Quiver 會在「借出成功」「Spike 抓到」「自動續借」等事件即時推訊息。",
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
      strategyTitle: "Strategy preset",
      strategyDesc: "Pick a lending style — controls how Quiver splits the ladder and selects the offer period. Switch any time; takes effect on the next deposit or auto-renew cycle.",
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
    bufferTip: "💡 Keep $50+ in your Quiver wallet as a fee buffer — since Quiver has no Bitfinex withdrawal permission, fees deduct from your Quiver wallet balance. Without a buffer, after 4 consecutive unpaid weeks Quiver will auto-pause your auto-lend until you top up. Premium subscription bypasses this entirely.",
    dunningPaused: {
      title: "Auto-lend paused by Quiver (4 weeks of unpaid fees)",
      body: "Your auto-lend has been auto-paused by Quiver. Toggling it on below won't help — the next Monday cron will pause it again. To resume: top up your Quiver wallet to cover the arrears, or upgrade to Premium.",
      topupCta: "Top up Quiver wallet",
      premiumCta: "Upgrade to Premium →",
    },
    telegramSection: {
      title: "Telegram alerts",
      desc: "Once bound, Quiver pushes you a message on each event: lent success, spike captured, auto-renew, etc.",
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
      strategyTitle: "戦略プリセット",
      strategyDesc: "貸付スタイルを選択 — Quiver のラダー分割と offer 期間の選び方を制御します。いつでも変更可能 — 次の入金または自動更新から反映されます。",
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
    bufferTip: "💡 Quiver wallet に $50+ をフィーバッファとして保持することを推奨 — Quiver は Bitfinex の出金権限を持たないため、フィーは Quiver wallet 残高から差し引かれます。バッファなしで 4 週連続未払いになると、Quiver は auto-lend を自動的に一時停止します。Premium 購読でこれを回避できます。",
    dunningPaused: {
      title: "Auto-lend は Quiver により一時停止されました(4 週連続未払い)",
      body: "Auto-lend は Quiver により自動的に一時停止されています — 下のトグルをオンにしても、次回月曜の cron で再び停止されます。再開するには、Quiver wallet をチャージして滞納を解消するか、Premium にアップグレードしてください。",
      topupCta: "Quiver wallet にチャージ",
      premiumCta: "Premium にアップグレード →",
    },
    telegramSection: {
      title: "Telegram 通知",
      desc: "バインドすると、Quiver は「貸出成功」「スパイク捕獲」「自動更新」などのイベントでメッセージをリアルタイムで送ります。",
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

              {/* F-5b-2: paused-by-Quiver banner — shown above the auto-lend
                  toggle so users immediately understand WHY the toggle won't
                  stick. Has both top-up and Premium escape hatches. */}
              {earn.dunning_pause_active ? (
                <Card className="border-red-300/60 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30">
                  <CardHeader className="flex-row items-start gap-3">
                    <PauseCircle className="h-5 w-5 flex-none text-red-600 dark:text-red-400" />
                    <div className="flex-1">
                      <CardTitle className="text-base text-red-800 dark:text-red-200">
                        {s.dunningPaused.title}
                      </CardTitle>
                      <CardDescription className="text-red-700/90 dark:text-red-300/90">
                        {s.dunningPaused.body}
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <Link
                          href={`/${locale}/wallet`}
                          className="font-medium text-red-700 hover:underline dark:text-red-300"
                        >
                          {s.dunningPaused.topupCta} →
                        </Link>
                        <Link
                          href={`/${locale}/subscription`}
                          className="font-medium text-amber-700 hover:underline dark:text-amber-300"
                        >
                          {s.dunningPaused.premiumCta}
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ) : null}

              {/* Auto-lend toggle */}
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-base">{s.connected.autoLendTitle}</CardTitle>
                    <CardDescription>{s.connected.autoLendDesc}</CardDescription>
                  </div>
                  <AutoLendToggle initial={earn.auto_lend_enabled} />
                </CardHeader>
                {/* F-5b-2: buffer hint for paying users (skip Friend & Premium). */}
                {(earn.perf_fee_bps ?? 0) > 0 && !earn.is_premium ? (
                  <CardContent className="pt-0">
                    <p className="rounded-md border border-sky-200/60 bg-sky-50/40 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                      {s.bufferTip}
                    </p>
                  </CardContent>
                ) : null}
              </Card>

              {/* F-5a-3.5 strategy preset selector */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{s.connected.strategyTitle}</CardTitle>
                  <CardDescription>{s.connected.strategyDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <StrategyPresetCard
                    initial={earn.strategy_preset ?? "balanced"}
                  />
                </CardContent>
              </Card>

              {/* F-5a-4.1 Telegram bot connect */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{s.telegramSection.title}</CardTitle>
                  <CardDescription>{s.telegramSection.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TelegramConnectCard
                    initialBound={earn.telegram_bound}
                    initialBotUsername={earn.telegram_bot_username}
                  />
                </CardContent>
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
                    {/* F-5b-2: warn public-tier connectors about Quiver wallet
                        buffer requirement before they connect (Friend tier
                        skips this — they pay no fee). */}
                    {preview.tier !== "friend" ? (
                      <p className="rounded-md border border-sky-200/60 bg-sky-50/40 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                        {s.bufferTip}
                      </p>
                    ) : null}
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

        {/* Right column — permissions mirror (sticky on desktop) */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <BitfinexPermissionsMirror locale={locale} />
        </div>
      </div>
    </div>
  );
}
