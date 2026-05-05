/**
 * InviteesList — F-5b-X. Per-invitee progress + commission overview.
 *
 * Server component: data prefetched on the /referral page and passed in.
 * Each row shows the invitee's masked email + onboarding stage badge +
 * revshare window state + L1 commission accrued from them specifically.
 *
 * Privacy:
 *   - Only masked email shown (backend does masking)
 *   - No balances / lending earnings exposed (those are private)
 *   - Earn tier is shown as a context badge so the inviter understands
 *     why some invitees never generate revshare (Friend / Premium tiers)
 */

import { CheckCircle2, Coins, MailOpen, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import type { InviteeOut } from "@/lib/api/referral";

type Locale = "zh-TW" | "en" | "ja";

/**
 * Translate raw funnel event codes to user-facing stage labels.
 * Mirrors the EVENT_LABEL map in /admin/funnel — duplicated rather than
 * shared to avoid coupling user-facing copy to admin-only debugging text
 * (admins want short technical hints; users want plain reassurance).
 */
const STAGE_LABELS: Record<Locale, Record<string, string>> = {
  "zh-TW": {
    signup_completed: "已註冊",
    tos_accepted: "已同意條款",
    kyc_form_opened: "填 KYC 中",
    kyc_submitted: "KYC 審核中",
    kyc_approved: "KYC 已通過",
    bot_settings_opened: "瀏覽放貸設定",
    bitfinex_connect_attempted: "嘗試連 Bitfinex",
    bitfinex_connect_failed: "連 Bitfinex 失敗",
    bitfinex_connect_succeeded: "已連 Bitfinex",
    first_deposit_received: "首筆入金到帳",
    first_lent_succeeded: "已開始借出",
  },
  en: {
    signup_completed: "Signed up",
    tos_accepted: "ToS accepted",
    kyc_form_opened: "Filling KYC",
    kyc_submitted: "KYC submitted",
    kyc_approved: "KYC approved",
    bot_settings_opened: "Browsing settings",
    bitfinex_connect_attempted: "Connecting Bitfinex",
    bitfinex_connect_failed: "Bitfinex failed",
    bitfinex_connect_succeeded: "Bitfinex connected",
    first_deposit_received: "First deposit",
    first_lent_succeeded: "Lending",
  },
  ja: {
    signup_completed: "登録完了",
    tos_accepted: "規約同意",
    kyc_form_opened: "KYC 入力中",
    kyc_submitted: "KYC 提出済",
    kyc_approved: "KYC 承認済",
    bot_settings_opened: "ボット設定閲覧",
    bitfinex_connect_attempted: "Bitfinex 接続試行",
    bitfinex_connect_failed: "Bitfinex 失敗",
    bitfinex_connect_succeeded: "Bitfinex 接続済",
    first_deposit_received: "初回入金",
    first_lent_succeeded: "貸出開始",
  },
};

const SECTION_STRINGS: Record<Locale, {
  title: string;
  desc: string;
  empty: string;
  totalCommission: (n: string) => string;
  ineligibleNote: string;
  invitedAt: string;
  commission: string;
  revshareUntil: (date: string) => string;
  revshareNotStarted: string;
  revshareExpired: string;
}> = {
  "zh-TW": {
    title: "你邀請的用戶",
    desc: "已被你邀請的用戶,以及他們的進度與你從他們身上獲得的分潤(L1 直邀)。Email 部分遮蔽以保護被邀請人隱私。",
    empty: "你還沒有邀請任何人。把你的推薦碼或分享連結傳給朋友,他們完成註冊後會自動出現在這裡。",
    totalCommission: (n) => `累計 L1 分潤:$${n} USDT`,
    ineligibleNote: "Friend / Premium 等級用戶不會產生分潤(他們本來就 0% 績效費)",
    invitedAt: "註冊於",
    commission: "你的分潤",
    revshareUntil: (date) => `分潤窗口至 ${date}`,
    revshareNotStarted: "分潤未開始(等他第一筆績效費)",
    revshareExpired: "分潤窗口已過",
  },
  en: {
    title: "Your invitees",
    desc: "Users you've invited, their onboarding stage, and the L1 commission you've received from each. Emails are partially masked for privacy.",
    empty: "No invitees yet. Share your referral code or link with friends — they'll appear here once they sign up.",
    totalCommission: (n) => `Total L1 commission: $${n} USDT`,
    ineligibleNote: "Friend / Premium tiers generate no commission (they have 0% perf fee)",
    invitedAt: "Joined",
    commission: "Your commission",
    revshareUntil: (date) => `Revshare window ends ${date}`,
    revshareNotStarted: "Revshare not started (waiting for first perf fee)",
    revshareExpired: "Revshare window expired",
  },
  ja: {
    title: "あなたの招待者",
    desc: "招待した users、彼らの進捗、彼らから獲得した L1 コミッション。メールは保護のため一部マスク。",
    empty: "招待者はまだいません。リファラルコードまたはリンクを友達と共有してください。",
    totalCommission: (n) => `累計 L1 コミッション: $${n} USDT`,
    ineligibleNote: "Friend / Premium ティアはコミッションを生成しません(0% フィー)",
    invitedAt: "登録日",
    commission: "コミッション",
    revshareUntil: (date) => `レベニューシェア窓口 ${date} まで`,
    revshareNotStarted: "未開始(初回パフォーマンスフィー待ち)",
    revshareExpired: "窓口期限切れ",
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function fmtDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(
    locale === "zh-TW" ? "zh-TW" : locale,
    { year: "numeric", month: "2-digit", day: "2-digit" },
  );
}

function fmtUsd(n: string): string {
  const v = Number(n);
  if (Number.isNaN(v)) return n;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Pick a stage badge tone based on how far the invitee has progressed.
 * Earlier stages = neutral grey; mid-funnel = amber; lending = green.
 */
function stageTone(eventName: string | null): string {
  if (!eventName) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  if (
    eventName === "first_lent_succeeded" ||
    eventName === "first_deposit_received"
  ) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  if (
    eventName === "bitfinex_connect_succeeded" ||
    eventName === "kyc_approved"
  ) {
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  }
  if (eventName.startsWith("kyc_") || eventName.includes("connect")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function tierLabel(tier: string | null, locale: Locale): string {
  if (!tier) return "—";
  if (tier === "friend") return locale === "en" ? "Friend" : locale === "ja" ? "Friend" : "Friend 等級";
  if (tier === "premium") return "Premium";
  if (tier === "public") return locale === "en" ? "Standard" : locale === "ja" ? "標準" : "標準";
  return tier;
}

export function InviteesList({
  invitees,
  totalCommissionUsdt,
  locale: rawLocale,
}: {
  invitees: InviteeOut[];
  totalCommissionUsdt: string;
  locale: string;
}) {
  const locale = pickLocale(rawLocale);
  const s = SECTION_STRINGS[locale];
  const labels = STAGE_LABELS[locale];

  if (invitees.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{s.title}</h2>
        <p className="text-sm text-slate-500">{s.desc}</p>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          {s.empty}
        </div>
      </div>
    );
  }

  const totalNum = Number(totalCommissionUsdt);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{s.title}</h2>
        <p className="text-sm text-slate-500">{s.desc}</p>
      </div>

      {totalNum > 0 ? (
        <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Coins className="mr-1.5 inline-block h-4 w-4" />
          {s.totalCommission(fmtUsd(totalCommissionUsdt))}
        </div>
      ) : null}

      <ul className="divide-y divide-cream-edge dark:divide-slate-800">
        {invitees.map((inv) => {
          const stageLabel = inv.last_event_name
            ? labels[inv.last_event_name] ?? inv.last_event_name
            : "—";
          const tone = stageTone(inv.last_event_name);
          const expiresAt = inv.revshare_expires_at;
          const startedAt = inv.revshare_started_at;
          let revshareLine: string;
          if (expiresAt) {
            const exp = new Date(expiresAt);
            revshareLine =
              exp.getTime() < Date.now()
                ? s.revshareExpired
                : s.revshareUntil(fmtDate(expiresAt, locale));
          } else {
            revshareLine = s.revshareNotStarted;
          }
          return (
            <li key={inv.invitee_user_id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <MailOpen className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-mono">{inv.masked_email}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
                  {stageLabel}
                </span>
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <ShieldCheck className="mr-0.5 inline-block h-3 w-3" />
                  {tierLabel(inv.earn_tier, locale)}
                </span>
                <span className="ml-auto text-xs text-slate-500">
                  {s.invitedAt} {fmtDate(inv.invited_at, locale)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                <span className="font-mono text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="mr-0.5 inline-block h-3 w-3" />
                  {s.commission}: ${fmtUsd(inv.commission_l1_usdt)} USDT
                </span>
                <span
                  className={
                    inv.is_revshare_eligible
                      ? "text-slate-500"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {revshareLine}
                </span>
              </div>
              {!inv.is_revshare_eligible ? (
                <p className="mt-0.5 text-[10px] italic text-amber-600/80 dark:text-amber-400/80">
                  ⚠ {s.ineligibleNote}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
