import Link from "next/link";
import { ArrowRight, BookOpen, Coins, KeyRound, Layers, UserPlus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Guide hub — index page listing the three sub-guides in recommended order.
 *
 * Per-locale STRINGS dict (same pattern as other content-heavy pages).
 */
type Locale = "zh-TW" | "en" | "ja";

interface CardCopy {
  step: string;
  title: string;
  desc: string;
  cta: string;
  duration: string;
}

interface Strings {
  title: string;
  subtitle: string;
  flowHint: string;
  advancedHint: string;
  cards: {
    lending: CardCopy;
    signup: CardCopy;
    apiKey: CardCopy;
    strategy: CardCopy;
  };
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    title: "Earn 教學",
    subtitle: "從不會 Bitfinex 到自動賺利息,3 個步驟看完不到 15 分鐘。",
    flowHint: "完全沒接觸過的話,建議照 ① → ② → ③ 順序看。",
    advancedHint: "進階:想理解 Quiver 的策略 + 階梯掛單內部運作怎麼決定你的利率,看 ④。",
    cards: {
      lending: {
        step: "①",
        title: "何謂 Bitfinex 放貸?",
        desc: "用最白話解釋:你借 USDT 給想做槓桿的交易者,他們付你利息。為什麼比銀行定存高、為什麼比 DeFi 安全。",
        cta: "看介紹",
        duration: "約 4 分鐘",
      },
      signup: {
        step: "②",
        title: "如何註冊 Bitfinex?",
        desc: "Email 註冊 → 完成 KYC → 開啟 2FA。沒有 Bitfinex 帳號的話,先做這個。",
        cta: "看註冊步驟",
        duration: "約 5 分鐘(KYC 審核另計)",
      },
      apiKey: {
        step: "③",
        title: "Bitfinex API Key 設定",
        desc: "在 Bitfinex 開一把唯讀 + 放貸權限的 API key,貼到 Quiver 就能自動放貸。詳列權限勾哪些、不要勾哪些。",
        cta: "看 API key 教學",
        duration: "約 5 分鐘",
      },
      strategy: {
        step: "④",
        title: "策略類型 + 階梯掛單完整說明",
        desc: "保守 / 平衡 / 進取 真正的差別、階梯掛單怎麼把資金切成 5 階等待利率飆漲、為什麼小額看不到策略效果。實際數字 + 常見問答。",
        cta: "看策略拆解",
        duration: "約 7 分鐘",
      },
    },
  },
  en: {
    title: "Earn Guide",
    subtitle: "From zero Bitfinex experience to auto-earning interest in 3 steps. Under 15 minutes total.",
    flowHint: "If you're brand new, follow ① → ② → ③ in order.",
    advancedHint: "Advanced: to understand how Quiver's strategy + ladder logic decides your rate, see ④.",
    cards: {
      lending: {
        step: "①",
        title: "What is Bitfinex Funding lending?",
        desc: "In plain language: you lend USDT to leverage traders who pay you interest. Why it beats traditional bank deposits and feels safer than DeFi.",
        cta: "Read intro",
        duration: "~4 min read",
      },
      signup: {
        step: "②",
        title: "How to sign up for Bitfinex",
        desc: "Email signup → complete KYC → enable 2FA. Start here if you don't have a Bitfinex account yet.",
        cta: "Sign-up steps",
        duration: "~5 min (KYC review separate)",
      },
      apiKey: {
        step: "③",
        title: "Bitfinex API key setup",
        desc: "Create a read + funding-only API key on Bitfinex and paste it into Quiver to enable auto-lending. Detailed permissions checklist included.",
        cta: "API key guide",
        duration: "~5 min",
      },
      strategy: {
        step: "④",
        title: "Strategy presets + ladder explained",
        desc: "Real differences between Conservative / Balanced / Aggressive, how the 5-tier ladder slices funds to capture spikes, and why small balances don't see preset effects. Real numbers + FAQ.",
        cta: "See strategy breakdown",
        duration: "~7 min",
      },
    },
  },
  ja: {
    title: "Earn ガイド",
    subtitle: "Bitfinex の経験ゼロから自動で利息を得るまで、3 ステップで合計 15 分以内。",
    flowHint: "初めての方は ① → ② → ③ の順で読むのがおすすめ。",
    advancedHint: "上級:Quiver の戦略 + ラダー(階段オファー)ロジックがどのようにあなたの金利を決めるか理解するには ④ を参照。",
    cards: {
      lending: {
        step: "①",
        title: "Bitfinex Funding 貸付とは?",
        desc: "わかりやすく説明:USDT をレバレッジトレーダーに貸し、彼らがあなたに利息を支払います。なぜ従来の銀行預金より高く、DeFi より安全に感じられるのか。",
        cta: "概要を読む",
        duration: "約 4 分",
      },
      signup: {
        step: "②",
        title: "Bitfinex 登録方法",
        desc: "メール登録 → KYC 完了 → 2FA 有効化。Bitfinex アカウントをまだ持っていない方はこちらから。",
        cta: "登録手順を見る",
        duration: "約 5 分(KYC 審査は別)",
      },
      apiKey: {
        step: "③",
        title: "Bitfinex API キー設定",
        desc: "Bitfinex で読取 + Funding 権限のみの API キーを作成し、Quiver に貼り付けて自動貸付を有効化。詳細な権限チェックリスト付き。",
        cta: "API キーガイド",
        duration: "約 5 分",
      },
      strategy: {
        step: "④",
        title: "戦略プリセット + ラダー(階段オファー)完全解説",
        desc: "保守 / バランス / アグレッシブの本当の違い、ラダーが資金を 5 段階に切って金利急騰を捕捉する仕組み、小額では戦略効果が見えない理由。実数字 + よくある質問。",
        cta: "戦略の内訳を見る",
        duration: "約 7 分",
      },
    },
  },
};

function pickLocale(locale: string): Locale {
  if (locale === "en" || locale === "ja") return locale;
  return "zh-TW";
}

interface GuideCardProps {
  href: string;
  Icon: typeof Coins;
  copy: CardCopy;
  accent: string;
}

function GuideCard({ href, Icon, copy, accent }: GuideCardProps) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg">
        <CardHeader className="flex-row items-start gap-3">
          <span
            className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${accent}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {copy.step} · {copy.duration}
            </div>
            <CardTitle className="text-base">{copy.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>{copy.desc}</CardDescription>
          <div className="inline-flex items-center gap-1 text-sm font-medium text-brand group-hover:underline">
            {copy.cta} <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function GuideHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-amber">
          <BookOpen className="h-6 w-6 text-amber-600" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {s.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
        </div>
      </div>

      <p className="rounded-md border border-cream-edge bg-paper px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {s.flowHint}
      </p>

      <div className="grid gap-4">
        <GuideCard
          href={`/${locale}/guide/what-is-bitfinex-lending`}
          Icon={Coins}
          copy={s.cards.lending}
          accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        />
        <GuideCard
          href={`/${locale}/guide/sign-up-bitfinex`}
          Icon={UserPlus}
          copy={s.cards.signup}
          accent="bg-sky-500/15 text-sky-700 dark:text-sky-300"
        />
        <GuideCard
          href={`/${locale}/guide/bitfinex-api-key`}
          Icon={KeyRound}
          copy={s.cards.apiKey}
          accent="bg-violet-500/15 text-violet-700 dark:text-violet-300"
        />
      </div>

      <p className="rounded-md border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        {s.advancedHint}
      </p>

      <div className="grid gap-4">
        <GuideCard
          href={`/${locale}/guide/strategy-presets`}
          Icon={Layers}
          copy={s.cards.strategy}
          accent="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        />
      </div>
    </div>
  );
}
