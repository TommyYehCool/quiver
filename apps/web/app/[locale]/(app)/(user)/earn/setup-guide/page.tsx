import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Earn setup guide — static page, content in 3 languages.
 *
 * We use a per-locale dictionary instead of next-intl's nested t() calls
 * because the content is heavily structured (numbered lists, inline code,
 * external links) and tighter to maintain as colocated triple-language blocks.
 */
type Locale = "zh-TW" | "en" | "ja";

const PROD_IP = "45.77.30.174";

interface Strings {
  back: string;
  title: string;
  subtitle: string;
  step1: { title: string; introBefore: string; linkText: string; introAfter: string; labelHint: string };
  step2: { title: string; desc: string; yesHeader: string; yes: string[]; noHeader: string; no: string[] };
  step3: { title: string; instruction: string; ipNote: string };
  step4: { title: string; body: string };
  step5: { title: string; desc: string; steps: string[]; warning: string };
  step6: { title: string; bodyBefore: string; linkText: string; bodyAfter: string };
  faq: { title: string; items: { q: string; a: string }[] };
  cta: string;
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    back: "回到連接頁面",
    title: "Bitfinex API Key 設定教學",
    subtitle:
      "5 分鐘設好,讓 Quiver 自動幫你在 Bitfinex 放貸賺利息。你的錢始終在你自己 Bitfinex 帳號裡(Quiver 沒有提現權限)。",
    step1: {
      title: "步驟一:登入 Bitfinex 開新 API Key",
      introBefore: "登入 ",
      linkText: "setting.bitfinex.com/api",
      introAfter: ",點 Create New API Key。",
      labelHint: "Label 建議:quiver-earn",
    },
    step2: {
      title: "步驟二:勾選權限",
      desc: "看清楚,勾錯會出問題",
      yesHeader: "✅ 要打開的",
      yes: [
        "Account Info → Get account fee information",
        "Account History → Get historical balances entries and trade information",
        "Orders → Get orders and statuses",
        "Margin Trading → Get position and margin info",
        "Margin Funding → Get funding statuses and info ⭐",
        "Margin Funding → Offer, cancel and close funding ⭐(核心)",
        "Wallets → Get wallet balances and addresses ⭐",
        "Settings → Read account settings",
      ],
      noHeader: "❌ 絕對不要打開",
      no: [
        "Withdrawals → Create a new withdrawal(被偷錢的最大入口,任何時候都不要開)",
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
        "Edit account information / Write account settings",
      ],
    },
    step3: {
      title: "步驟三:IP Allowlist(必做)",
      instruction:
        "找到「IP Access restrictions」,確保「Allow access from any IP」維持 OFF,然後在框框填入:",
      ipNote: "這是 Quiver prod server IP。萬一 key 外洩,從別的 IP 也用不了。",
    },
    step4: {
      title: "步驟四:Generate + 複製 key",
      body: "輸入 2FA 後 Generate Key。Bitfinex 會給你 API Key + Secret(Secret 只顯示一次,複製好)。",
    },
    step5: {
      title: "步驟五:複製 Funding wallet 入金地址",
      desc: "Quiver 需要這個地址才能把你的 USDT 送過去",
      steps: [
        "Bitfinex → Wallets → Deposit",
        "選 Tether (USDt)",
        "Network 選 Tron (TRX)",
        "會看到三個地址(Exchange / Margin / Funding)",
        "只複製 Funding wallet address(不是 Exchange,不是 Margin)",
      ],
      warning: "⚠ 複製錯地址會讓錢卡在錯的 wallet,要 Funding 才能放貸",
    },
    step6: {
      title: "步驟六:回 Quiver 連接",
      bodyBefore: "把 API key + Secret + Funding 入金地址貼進 ",
      linkText: "/earn/connect",
      bodyAfter: " 的表單。Quiver 會立刻 call Bitfinex 驗證 key 通過才存。",
    },
    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. 我可以隨時撤銷 Quiver 的權限嗎?",
          a: "可以。任何時候到 setting.bitfinex.com/api 點 Revoke 那把 key,Quiver 立刻無法再操作。你 Bitfinex 上的部位完全不受影響。",
        },
        {
          q: "Q. 萬一 key 被偷會怎樣?",
          a: "攻擊者不能提走你的錢(沒 Withdrawal 權限),最多能幫你掛/取消 funding offer。加上 IP allowlist,攻擊者必須先攻陷 Quiver server 才能用這把 key。",
        },
        {
          q: "Q. 我可以隨時把錢從 Bitfinex 提走嗎?",
          a: "可以,100% 在你控制。先在 Bitfinex 取消 active funding offer 或等到期,再從 Bitfinex 提到任何錢包。Quiver 沒有提現權限,提錢始終是你自己操作。",
        },
        {
          q: "Q. Bitfinex KYC 沒過可以用嗎?",
          a: "Bitfinex Funding 一般要 Intermediate KYC 以上才能用。先在 Bitfinex 完成 KYC 再來。",
        },
      ],
    },
    cta: "開始連接 Bitfinex →",
  },

  en: {
    back: "Back to connect page",
    title: "Bitfinex API Key Setup Guide",
    subtitle:
      "Set up in 5 minutes so Quiver can auto-lend your USDT on Bitfinex Funding. Your money stays in your own Bitfinex account — Quiver has no withdrawal permission.",
    step1: {
      title: "Step 1 — Sign in to Bitfinex and create a new API key",
      introBefore: "Sign in at ",
      linkText: "setting.bitfinex.com/api",
      introAfter: ", then click Create New API Key.",
      labelHint: "Suggested label: quiver-earn",
    },
    step2: {
      title: "Step 2 — Choose permissions",
      desc: "Read carefully — wrong selection causes issues",
      yesHeader: "✅ Enable these",
      yes: [
        "Account Info → Get account fee information",
        "Account History → Get historical balances entries and trade information",
        "Orders → Get orders and statuses",
        "Margin Trading → Get position and margin info",
        "Margin Funding → Get funding statuses and info ⭐",
        "Margin Funding → Offer, cancel and close funding ⭐ (core)",
        "Wallets → Get wallet balances and addresses ⭐",
        "Settings → Read account settings",
      ],
      noHeader: "❌ NEVER enable these",
      no: [
        "Withdrawals → Create a new withdrawal (the #1 attack vector — never enable)",
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
        "Edit account information / Write account settings",
      ],
    },
    step3: {
      title: "Step 3 — IP Allowlist (required)",
      instruction:
        'Find "IP Access restrictions", make sure "Allow access from any IP" stays OFF, then add this IP to the box:',
      ipNote:
        "This is Quiver's prod server IP. Even if your key leaks, attackers from other IPs cannot use it.",
    },
    step4: {
      title: "Step 4 — Generate + copy the key",
      body:
        "Enter your 2FA code and Generate Key. Bitfinex shows your API Key + Secret (the secret is shown only once — copy it safely).",
    },
    step5: {
      title: "Step 5 — Copy your Funding wallet deposit address",
      desc: "Quiver needs this address to send your USDT over",
      steps: [
        "Bitfinex → Wallets → Deposit",
        "Select Tether (USDt)",
        "Network: Tron (TRX)",
        "You'll see three addresses (Exchange / Margin / Funding)",
        "Copy only the Funding wallet address (not Exchange, not Margin)",
      ],
      warning:
        "⚠ Wrong address = funds stuck in the wrong wallet. Must be the Funding address for lending to work.",
    },
    step6: {
      title: "Step 6 — Back to Quiver and connect",
      bodyBefore:
        "Paste the API key + secret + Funding deposit address into the form at ",
      linkText: "/earn/connect",
      bodyAfter: ". Quiver immediately calls Bitfinex to verify the key works before storing.",
    },
    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. Can I revoke Quiver's permission any time?",
          a: "Yes. Go to setting.bitfinex.com/api and Revoke the key — Quiver loses access immediately. Your positions on Bitfinex are unaffected.",
        },
        {
          q: "Q. What if my key gets stolen?",
          a: "An attacker cannot withdraw your funds (no Withdrawal permission). Worst case: they place / cancel funding offers on your behalf. Combined with IP allowlist, attackers would need to compromise Quiver's server first to even use the key.",
        },
        {
          q: "Q. Can I withdraw from Bitfinex any time?",
          a: "Yes — 100% under your control. Cancel active funding offers in Bitfinex (or wait for them to mature), then withdraw to any wallet. Quiver has no withdraw permission — withdrawals are always your own action.",
        },
        {
          q: "Q. Can I use this without Bitfinex KYC?",
          a: "Bitfinex Funding generally requires Intermediate KYC or higher. Complete KYC on Bitfinex first.",
        },
      ],
    },
    cta: "Start connecting Bitfinex →",
  },

  ja: {
    back: "接続ページに戻る",
    title: "Bitfinex API キー設定ガイド",
    subtitle:
      "5 分で設定すれば、Quiver が Bitfinex Funding で自動貸付を行います。資金は常にあなたの Bitfinex アカウント内 — Quiver には出金権限はありません。",
    step1: {
      title: "ステップ 1 — Bitfinex にログインして新しい API キーを作成",
      introBefore: "",
      linkText: "setting.bitfinex.com/api",
      introAfter: " にログインし、Create New API Key をクリック。",
      labelHint: "推奨ラベル:quiver-earn",
    },
    step2: {
      title: "ステップ 2 — 権限を選択",
      desc: "よく確認してください — 間違えると問題が発生します",
      yesHeader: "✅ 有効にする",
      yes: [
        "Account Info → Get account fee information",
        "Account History → Get historical balances entries and trade information",
        "Orders → Get orders and statuses",
        "Margin Trading → Get position and margin info",
        "Margin Funding → Get funding statuses and info ⭐",
        "Margin Funding → Offer, cancel and close funding ⭐(核心)",
        "Wallets → Get wallet balances and addresses ⭐",
        "Settings → Read account settings",
      ],
      noHeader: "❌ 絶対に有効にしない",
      no: [
        "Withdrawals → Create a new withdrawal(資金窃取の最大入口、絶対に有効にしない)",
        "Wallets → Transfer between your wallets",
        "Orders → Create and cancel orders",
        "Margin Trading → Claim a position",
        "Edit account information / Write account settings",
      ],
    },
    step3: {
      title: "ステップ 3 — IP Allowlist(必須)",
      instruction:
        "「IP Access restrictions」を見つけ、「Allow access from any IP」を OFF のままにして、ボックスに次の IP を入力:",
      ipNote:
        "これは Quiver 本番サーバーの IP です。万一キーが漏洩しても、他の IP からは使用できません。",
    },
    step4: {
      title: "ステップ 4 — キーを生成してコピー",
      body:
        "2FA コードを入力して Generate Key。Bitfinex が API Key + Secret を表示します(Secret は 1 回しか表示されないので、必ずコピーしてください)。",
    },
    step5: {
      title: "ステップ 5 — Funding ウォレットの入金アドレスをコピー",
      desc: "Quiver があなたの USDT を送るためにこのアドレスが必要です",
      steps: [
        "Bitfinex → Wallets → Deposit",
        "Tether (USDt) を選択",
        "Network は Tron (TRX) を選択",
        "3 つのアドレスが表示される(Exchange / Margin / Funding)",
        "Funding ウォレットのアドレスのみをコピー(Exchange でも Margin でもなく)",
      ],
      warning:
        "⚠ 間違ったアドレスをコピーすると資金が誤ったウォレットに留まります。貸付には Funding アドレスが必須です。",
    },
    step6: {
      title: "ステップ 6 — Quiver に戻って接続",
      bodyBefore:
        "API キー + Secret + Funding 入金アドレスを ",
      linkText: "/earn/connect",
      bodyAfter:
        " のフォームに貼り付けてください。Quiver は即座に Bitfinex を呼び出してキーを検証してから保存します。",
    },
    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. いつでも Quiver の権限を取り消せますか?",
          a: "はい。setting.bitfinex.com/api でそのキーを Revoke すれば、Quiver は即座に操作できなくなります。Bitfinex 上のポジションには一切影響しません。",
        },
        {
          q: "Q. もしキーが盗まれたらどうなりますか?",
          a: "攻撃者は資金を引き出せません(出金権限がないため)。最悪の場合、funding offer の作成 / 取消が可能なだけです。IP Allowlist と組み合わせれば、攻撃者は Quiver サーバーを侵害しない限りキーを使用できません。",
        },
        {
          q: "Q. いつでも Bitfinex から資金を引き出せますか?",
          a: "はい、100% あなたの管理下です。Bitfinex でアクティブな funding offer を取消するか満期を待ち、任意のウォレットに出金してください。Quiver には出金権限がないため、出金は常にあなた自身の操作です。",
        },
        {
          q: "Q. Bitfinex KYC を完了していなくても使えますか?",
          a: "Bitfinex Funding は通常、Intermediate KYC 以上が必要です。先に Bitfinex で KYC を完了してください。",
        },
      ],
    },
    cta: "Bitfinex 接続を始める →",
  },
};

function pickLocale(locale: string): Locale {
  if (locale === "en" || locale === "ja") return locale;
  return "zh-TW";
}

export default function SetupGuidePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const l = pickLocale(locale);
  const s = STRINGS[l];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href={`/${locale}/earn/connect`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{s.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step1.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {s.step1.introBefore}
            <a
              href="https://setting.bitfinex.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              {s.step1.linkText}
            </a>
            {s.step1.introAfter}
          </p>
          <p>
            {s.step1.labelHint.split(":")[0]}:
            <code className="ml-1 rounded bg-slate-100 px-1 dark:bg-slate-800">
              {s.step1.labelHint.split(":")[1]?.trim() ?? "quiver-earn"}
            </code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step2.title}</CardTitle>
          <CardDescription>{s.step2.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
              {s.step2.yesHeader}
            </div>
            <ul className="ml-4 list-disc space-y-0.5 text-slate-700 dark:text-slate-300">
              {s.step2.yes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium text-red-700 dark:text-red-400">{s.step2.noHeader}</div>
            <ul className="ml-4 list-disc space-y-0.5 text-slate-700 dark:text-slate-300">
              {s.step2.no.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step3.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{s.step3.instruction}</p>
          <div className="rounded bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-slate-800">
            {PROD_IP}
          </div>
          <p className="text-xs text-slate-500">{s.step3.ipNote}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step4.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{s.step4.body}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step5.title}</CardTitle>
          <CardDescription>{s.step5.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="ml-4 list-decimal space-y-1 text-slate-700 dark:text-slate-300">
            {s.step5.steps.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p className="text-xs text-amber-700 dark:text-amber-400">{s.step5.warning}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.step6.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {s.step6.bodyBefore}
            <Link href={`/${locale}/earn/connect`} className="text-brand hover:underline">
              {s.step6.linkText}
            </Link>
            {s.step6.bodyAfter}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-cream-warm/40 dark:bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-base">{s.faq.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {s.faq.items.map((item, i) => (
            <div key={i}>
              <div className="font-medium">{item.q}</div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center">
        <Link href={`/${locale}/earn/connect`}>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
            {s.cta}
          </button>
        </Link>
      </div>
    </div>
  );
}
