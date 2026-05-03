import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Locale = "zh-TW" | "en" | "ja";

// Tommy's personal Bitfinex referral link — shared with friends per his note.
const BITFINEX_REFERRAL_URL = "https://www.bitfinex.com/sign-up?refcode=eJFY4-MvE";

interface Strings {
  back: string;
  title: string;
  subtitle: string;
  refBox: { lead: string; cta: string; benefit: string };
  s1: { h: string; body: string };
  s2: { h: string; lead: string; steps: string[]; tail: string };
  s3: { h: string; lead: string; steps: string[]; warning: string };
  s4: { h: string; lead: string; steps: string[] };
  s5: { h: string; body: string };
  faq: { title: string; items: { q: string; a: string }[] };
  ctaPrimary: string;
  ctaSecondary: string;
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    back: "回教學首頁",
    title: "② 如何註冊 Bitfinex",
    subtitle: "從沒帳號到能用 Funding 放貸,實際操作 5 分鐘加上 KYC 審核(通常數小時到 1-2 個工作天)。",

    refBox: {
      lead: "用以下連結註冊,可以幫助 Quiver:",
      cta: "用推薦連結註冊 Bitfinex",
      benefit: "你會獲得手續費折扣 6%(Bitfinex 原生機制),完全沒副作用、不影響你權限。",
    },

    s1: {
      h: "註冊前提醒",
      body: "Bitfinex 有最低存款額(目前 $0),但要做 Funding 放貸至少要完成 Intermediate 等級 KYC。準備好身分證 / 護照、地址證明(銀行對帳單或水電費單)。整個流程不需要付任何錢給 Bitfinex。",
    },

    s2: {
      h: "步驟一:Email 註冊",
      lead: "點上面的推薦連結後:",
      steps: [
        "輸入 Email + 一個強密碼(建議用 password manager 隨機生成)",
        "選擇你所在國家(影響可用功能)",
        "勾選同意條款,送出",
        "去 email 收信點驗證連結",
      ],
      tail: "驗證 email 後,你已經有 Bitfinex 帳號。但目前還不能存款 / 放貸,要先過 KYC。",
    },

    s3: {
      h: "步驟二:完成 KYC(身分驗證)",
      lead: "登入後左上角點頭像 → Verification。Bitfinex 分 Basic / Intermediate / Full 三級,Funding 放貸至少要 Intermediate。",
      steps: [
        "Basic:輸入姓名、生日、國籍 — 5 分鐘搞定",
        "Intermediate:上傳身分證或護照 + 地址證明(銀行對帳單 / 水電費單,需 3 個月內)",
        "上傳自拍照(手持身分證)",
        "送出 → 等審核(通常數小時到 1-2 工作天,旺季可能更久)",
      ],
      warning: "⚠ 地址證明要跟你註冊時填的地址一致,不然會被退回。",
    },

    s4: {
      h: "步驟三:開啟兩步驟驗證(2FA)",
      lead: "KYC 過了就立刻設 2FA,這是必做。Settings → Security → Two-Factor Authentication:",
      steps: [
        "選 Google Authenticator(或 Authy)",
        "用手機 app 掃 QR code",
        "輸入 6 位 code 完成綁定",
        "把 backup code 印出來放安全地方(萬一手機丟了用這個救回)",
      ],
    },

    s5: {
      h: "步驟四:準備好 Funding 錢包",
      body: "Bitfinex 有三個錢包:Exchange(現貨交易)、Margin(槓桿)、Funding(放貸)。Quiver 之後會送 USDT 到你的 Funding 錢包,你不需要先存錢進去 — 等下一步把 API key 設好,Quiver 會自動處理整個流程。",
    },

    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. 註冊 Bitfinex 要付錢嗎?",
          a: "不用。註冊免費、KYC 免費。只有實際交易/提領時才有手續費。Funding 放貸 Bitfinex 從你利息抽 15%,不從你帳戶扣錢。",
        },
        {
          q: "Q. 可以用台灣 / 日本 / 美國身分嗎?",
          a: "Bitfinex 在絕大多數國家都能用,但有少數限制名單(包含美國 / 北韓 / 伊朗等)。註冊頁面選國家時就會看到是否可用。",
        },
        {
          q: "Q. KYC 多久過?",
          a: "通常數小時到 1-2 個工作天。旺季(BTC 大漲時)可能拖 3-7 天。提交完之後可以先去看 Quiver 的「③ API Key 設定教學」做心理準備。",
        },
        {
          q: "Q. 一定要用你的推薦連結嗎?",
          a: "不一定。直接 google 「Bitfinex sign up」也行,Quiver 完全不會少功能或加費用。推薦連結只是雙方都拿到 Bitfinex 的手續費折扣 — 你拿 6%,Tommy 拿一點。",
        },
      ],
    },

    ctaPrimary: "下一步:設定 API Key 連 Quiver →",
    ctaSecondary: "想先回去看放貸介紹",
  },

  en: {
    back: "Back to guide hub",
    title: "② How to sign up for Bitfinex",
    subtitle: "Zero account to ready-for-Funding takes about 5 minutes of typing plus KYC review (typically a few hours to 1-2 business days).",

    refBox: {
      lead: "Sign up via this link to help support Quiver:",
      cta: "Sign up to Bitfinex via referral",
      benefit: "You get a 6% fee discount (Bitfinex's native referral perk) — no downside, no permission impact.",
    },

    s1: {
      h: "Before you start",
      body: "Bitfinex has no minimum deposit ($0), but Funding requires Intermediate KYC. Have your government ID / passport and proof of address ready (bank statement or utility bill within the last 3 months). Signing up costs nothing.",
    },

    s2: {
      h: "Step 1 — Email signup",
      lead: "After clicking the referral link above:",
      steps: [
        "Enter email + a strong password (use a password manager)",
        "Select your country (affects available features)",
        "Accept terms and submit",
        "Check email and click the verification link",
      ],
      tail: "Once your email is verified, your Bitfinex account exists — but you can't deposit or lend yet. KYC comes next.",
    },

    s3: {
      h: "Step 2 — Complete KYC (identity verification)",
      lead: "After login, click your avatar (top left) → Verification. Bitfinex has Basic / Intermediate / Full tiers; Funding needs Intermediate.",
      steps: [
        "Basic: enter name, DOB, nationality — done in 5 minutes",
        "Intermediate: upload ID or passport + proof of address (bank statement / utility bill, within 3 months)",
        "Upload a selfie (holding your ID)",
        "Submit → wait for review (usually a few hours to 1-2 business days, longer during high-demand periods)",
      ],
      warning: "⚠ Proof of address must match the address you provided at signup, otherwise it gets rejected.",
    },

    s4: {
      h: "Step 3 — Enable Two-Factor Authentication (2FA)",
      lead: "Set up 2FA right after KYC approval — required. Settings → Security → Two-Factor Authentication:",
      steps: [
        "Choose Google Authenticator (or Authy)",
        "Scan the QR code with your authenticator app",
        "Enter the 6-digit code to confirm",
        "Print and securely store the backup codes (lifesaver if you lose your phone)",
      ],
    },

    s5: {
      h: "Step 4 — Make sure you have a Funding wallet",
      body: "Bitfinex has three wallets: Exchange (spot trading), Margin (leverage), and Funding (lending). Quiver later sends USDT to your Funding wallet — you don't need to deposit anything yet. Once you set up the API key in the next guide, Quiver handles the whole flow.",
    },

    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. Does signing up for Bitfinex cost money?",
          a: "No. Registration and KYC are free. You only pay fees when trading or withdrawing. For Funding lending, Bitfinex takes 15% from the interest your borrowers pay — not from your account balance.",
        },
        {
          q: "Q. Can I sign up from any country?",
          a: "Bitfinex works in most countries, but a small restricted list applies (US, North Korea, Iran, etc.). The country selector at signup will show eligibility.",
        },
        {
          q: "Q. How long does KYC take?",
          a: "Usually a few hours to 1-2 business days. During peak crypto cycles it may take 3-7 days. After submitting, you can read the \"③ API Key setup guide\" to prepare.",
        },
        {
          q: "Q. Do I have to use the referral link?",
          a: "No. Searching \"Bitfinex sign up\" works too — Quiver functionality is identical. The referral link just means both you and Tommy get a Bitfinex fee discount perk (6% for you).",
        },
      ],
    },

    ctaPrimary: "Next: API key setup → connect Quiver",
    ctaSecondary: "Go back and read the lending intro first",
  },

  ja: {
    back: "ガイドトップに戻る",
    title: "② Bitfinex 登録方法",
    subtitle: "アカウント無しから Funding 利用可能まで、入力 5 分 + KYC 審査(通常数時間〜 1-2 営業日)。",

    refBox: {
      lead: "以下のリンクから登録して Quiver をサポートできます:",
      cta: "リファラルリンクで Bitfinex に登録",
      benefit: "手数料 6% 割引(Bitfinex のネイティブ機能)が得られます。デメリットなし、権限への影響もありません。",
    },

    s1: {
      h: "登録前の注意",
      body: "Bitfinex に最低入金額はありません($0)が、Funding 貸付には Intermediate レベル KYC が必要です。身分証 / パスポートと住所証明(3 ヶ月以内の銀行明細や公共料金請求書)を用意してください。登録自体は無料です。",
    },

    s2: {
      h: "ステップ 1 — メール登録",
      lead: "上のリファラルリンクをクリック後:",
      steps: [
        "メールアドレス + 強いパスワードを入力(パスワードマネージャーの使用を推奨)",
        "居住国を選択(利用可能機能に影響)",
        "規約に同意して送信",
        "メールで認証リンクを確認してクリック",
      ],
      tail: "メール認証後、Bitfinex アカウントは作成済みですが、まだ入金 / 貸付はできません。次は KYC です。",
    },

    s3: {
      h: "ステップ 2 — KYC(本人確認)を完了",
      lead: "ログイン後、左上のアバターをクリック → Verification。Bitfinex は Basic / Intermediate / Full の 3 段階、Funding には Intermediate 以上が必要。",
      steps: [
        "Basic:氏名、生年月日、国籍を入力 — 5 分で完了",
        "Intermediate:身分証またはパスポート + 住所証明(3 ヶ月以内の銀行明細 / 公共料金請求書)をアップロード",
        "自撮り写真(身分証を手に持って)をアップロード",
        "送信 → 審査待ち(通常数時間〜 1-2 営業日、混雑期はそれ以上)",
      ],
      warning: "⚠ 住所証明は登録時に入力した住所と一致する必要があります。違うと差し戻されます。",
    },

    s4: {
      h: "ステップ 3 — 二段階認証(2FA)を有効化",
      lead: "KYC 承認後すぐ 2FA を設定 — 必須です。Settings → Security → Two-Factor Authentication:",
      steps: [
        "Google Authenticator(または Authy)を選択",
        "認証アプリで QR コードをスキャン",
        "6 桁のコードを入力して確定",
        "バックアップコードを印刷して安全な場所に保管(端末紛失時の救済用)",
      ],
    },

    s5: {
      h: "ステップ 4 — Funding ウォレットの確認",
      body: "Bitfinex には 3 つのウォレットがあります:Exchange(現物取引)、Margin(レバレッジ)、Funding(貸付)。Quiver は後ほど USDT をあなたの Funding ウォレットへ送るので、事前入金は不要です。次のガイドで API キーを設定すれば、Quiver が全フローを処理します。",
    },

    faq: {
      title: "FAQ",
      items: [
        {
          q: "Q. Bitfinex 登録は有料ですか?",
          a: "無料です。登録も KYC も無料。実際の取引 / 出金時のみ手数料が発生します。Funding 貸付では Bitfinex が借り手の支払う利息から 15% を差し引きます — あなたの口座残高からは引かれません。",
        },
        {
          q: "Q. どの国からでも登録可能?",
          a: "Bitfinex は大多数の国で利用可能ですが、少数の制限リストがあります(米国、北朝鮮、イランなど)。登録時に国を選択すると利用可否が表示されます。",
        },
        {
          q: "Q. KYC はどれくらいで通る?",
          a: "通常数時間〜 1-2 営業日。仮想通貨ブーム期は 3-7 日かかることも。提出後は「③ API キー設定ガイド」を読んで準備するとよいでしょう。",
        },
        {
          q: "Q. リファラルリンクは必須?",
          a: "いいえ。「Bitfinex sign up」と検索しても OK で、Quiver の機能は同じです。リファラルリンクを使うと双方が Bitfinex の手数料割引特典を得られます(あなたは 6%、Tommy も少し)。",
        },
      ],
    },

    ctaPrimary: "次へ:API キー設定 → Quiver に接続",
    ctaSecondary: "貸付の概要をもう一度読む",
  },
};

function pickLocale(locale: string): Locale {
  if (locale === "en" || locale === "ja") return locale;
  return "zh-TW";
}

export default function SignUpBitfinexPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href={`/${locale}/guide`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{s.subtitle}</p>
      </div>

      {/* Referral CTA — front-and-center so people see it before scrolling */}
      <Card className="border-sky-300/60 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30">
        <CardContent className="space-y-3 py-5">
          <p className="text-sm text-slate-700 dark:text-slate-200">{s.refBox.lead}</p>
          <a
            href={BITFINEX_REFERRAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
          >
            {s.refBox.cta} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="text-xs text-slate-600 dark:text-slate-400">{s.refBox.benefit}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s1.h}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <p>{s.s1.body}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s2.h}</CardTitle>
          <CardDescription>{s.s2.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <ol className="ml-4 list-decimal space-y-1.5">
            {s.s2.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">{s.s2.tail}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s3.h}</CardTitle>
          <CardDescription>{s.s3.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <ol className="ml-4 list-decimal space-y-1.5">
            {s.s3.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-amber-700 dark:text-amber-400">{s.s3.warning}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s4.h}</CardTitle>
          <CardDescription>{s.s4.lead}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <ol className="ml-4 list-decimal space-y-1.5">
            {s.s4.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s5.h}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 dark:text-slate-300">
          <p>{s.s5.body}</p>
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/${locale}/guide/bitfinex-api-key`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          {s.ctaPrimary} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/${locale}/guide/what-is-bitfinex-lending`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-cream-edge bg-paper px-4 py-2.5 text-sm font-medium text-slate-ink hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        >
          {s.ctaSecondary}
        </Link>
      </div>
    </div>
  );
}
