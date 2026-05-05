import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Eye,
  FileText,
  Globe,
  History,
  KeyRound,
  Lock,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { RefCookieCapture } from "@/components/referral/ref-cookie-capture";
import { QuiverLogo } from "@/components/common/quiver-logo";

export default function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-paper dark:bg-slate-950">
      {/* F-5b-X: capture ?ref=XXX from share links into a cookie that
          survives the Google OAuth round-trip. RefBindOnLogin (mounted
          on the (app) layout) consumes the cookie post-login. */}
      <React.Suspense fallback={null}>
        <RefCookieCapture />
      </React.Suspense>
      <MacaronBlobs />
      <div className="relative">
        <Header locale={locale} />
        <Hero locale={locale} />
        <Naming />
        <PainPoint />
        <Features />
        <Earn locale={locale} />
        <Roadmap />
        <Trust />
        <CtaFinal locale={locale} />
        <Footer />
      </div>
    </main>
  );
}

/** 三顆模糊色塊充當背景裝飾。 */
function MacaronBlobs() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-macaron-peach opacity-60 blur-3xl dark:opacity-20" />
      <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-macaron-mint opacity-50 blur-3xl dark:opacity-15" />
      <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-macaron-lavender opacity-50 blur-3xl dark:opacity-20" />
    </div>
  );
}

function Header({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  return (
    <header className="container flex h-16 items-center justify-between">
      <Link href={`/${locale}`} className="flex items-center gap-2">
        <QuiverLogo size={36} />
        <span className="hidden font-display text-lg font-bold tracking-tight sm:inline">Quiver</span>
      </Link>
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <Button asChild size="sm">
          <Link href={`/${locale}/login`}>{t("login")}</Link>
        </Button>
      </div>
    </header>
  );
}

function Hero({ locale }: { locale: string }) {
  const t = useTranslations("marketing.hero");
  return (
    <section className="container py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-6 text-balance text-lg text-slate-600 dark:text-slate-300 md:text-xl">
          {t("subtitle")}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={`/${locale}/login`}>
              {t("cta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="#features">{t("secondary")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Naming section — 為什麼叫 Quiver?
 * 緊接 Hero 之後,讓用戶第一時間理解品牌名故事。
 * Layout:logo 大圖 + 三段式描述。
 */
function Naming() {
  const t = useTranslations("marketing.naming");
  return (
    <section className="container py-12 md:py-20">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        {/* Left: 大 logo + 視覺輔助 */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 -z-10 rounded-full bg-bubble-lavender/40 blur-3xl dark:bg-violet-950/40" />
          <QuiverLogo size={180} className="drop-shadow-2xl" />
        </div>

        {/* Right: 文案 */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-bubble-lavender px-3 py-1 text-xs font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
            <Sparkles className="h-3 w-3" />
            {t("badge")}
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
            {t("subtitle")}
          </p>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
            {t("story")}
          </p>
          <p className="mt-5 border-l-4 border-violet-400 pl-4 text-sm font-medium italic text-slate-700 dark:border-violet-600 dark:text-slate-200">
            {t("tagline")}
          </p>
        </div>
      </div>
    </section>
  );
}

/** 痛點對照:用戶遇到的問題 vs Quiver 解法 */
function PainPoint() {
  const t = useTranslations("marketing.painPoint");
  const items = [
    { problem: "p1Problem", solution: "p1Solution" },
    { problem: "p2Problem", solution: "p2Solution" },
    { problem: "p3Problem", solution: "p3Solution" },
    { problem: "p4Problem", solution: "p4Solution" },
  ];
  return (
    <section className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {t("subtitle")}
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
        {items.map((it) => (
          <div
            key={it.problem}
            className="rounded-2xl border border-cream-edge bg-paper p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-none rounded-full bg-red-100 p-1.5 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                <span className="block h-3.5 w-3.5 text-center text-xs font-bold leading-none">
                  ✕
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {t(it.problem)}
              </p>
            </div>
            <div className="mt-3 flex items-start gap-3 border-l-2 border-emerald-300 pl-3 dark:border-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t(it.solution)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 錢包功能 6 卡(原 3 + featuresMore 3) */
function Features() {
  const t = useTranslations("marketing.features");
  const tMore = useTranslations("marketing.featuresMore");

  const items = [
    {
      icon: Coins,
      key: "f1" as const,
      cardClass: "bg-macaron-peach dark:bg-slate-900",
      iconBgClass: "bg-bubble-peach text-amber-700",
      title: t("f1.title"),
      desc: t("f1.desc"),
    },
    {
      icon: Send,
      key: "f2" as const,
      cardClass: "bg-macaron-mint dark:bg-slate-900",
      iconBgClass: "bg-bubble-mint text-emerald-700",
      title: t("f2.title"),
      desc: t("f2.desc"),
    },
    {
      icon: Zap,
      key: "f3" as const,
      cardClass: "bg-macaron-lavender dark:bg-slate-900",
      iconBgClass: "bg-bubble-lavender text-violet-700",
      title: t("f3.title"),
      desc: t("f3.desc"),
    },
    {
      icon: Globe,
      key: "f4" as const,
      cardClass: "bg-macaron-sky dark:bg-slate-900",
      iconBgClass: "bg-bubble-sky text-sky-700",
      title: tMore("f4Title"),
      desc: tMore("f4Desc"),
    },
    {
      icon: Lock,
      key: "f5" as const,
      cardClass: "bg-macaron-rose dark:bg-slate-900",
      iconBgClass: "bg-bubble-rose text-rose-700",
      title: tMore("f5Title"),
      desc: tMore("f5Desc"),
    },
    {
      icon: FileText,
      key: "f6" as const,
      cardClass: "bg-macaron-lemon dark:bg-slate-900",
      iconBgClass: "bg-yellow-200 text-yellow-700",
      title: tMore("f6Title"),
      desc: tMore("f6Desc"),
    },
  ];

  return (
    <section id="features" className="container py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("sectionTitle")}
        </h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {t("sectionDesc")}
        </p>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, key, cardClass, iconBgClass, title, desc }) => (
          <div
            key={key}
            className={`rounded-2xl border border-cream-edge p-6 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 ${cardClass}`}
          >
            <div
              className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl dark:bg-slate-800 dark:text-slate-200 ${iconBgClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Quiver Earn 完整介紹 */
function Earn({ locale: _locale }: { locale: string }) {
  const t = useTranslations("marketing.earn");
  const compareT = useTranslations("marketing.earn.compare");

  const steps = [
    { titleKey: "step1Title", descKey: "step1Desc", icon: Wallet },
    { titleKey: "step2Title", descKey: "step2Desc", icon: KeyRound },
    { titleKey: "step3Title", descKey: "step3Desc", icon: Eye },
    { titleKey: "step4Title", descKey: "step4Desc", icon: Target },
  ];

  const highlights = [
    { tk: "h1", icon: TrendingUp, color: "text-emerald-700 bg-bubble-mint" },
    { tk: "h2", icon: ShieldCheck, color: "text-violet-700 bg-bubble-lavender" },
    { tk: "h3", icon: Sparkles, color: "text-amber-700 bg-bubble-peach" },
    { tk: "h4", icon: Zap, color: "text-sky-700 bg-bubble-sky" },
    { tk: "h5", icon: History, color: "text-rose-700 bg-bubble-rose" },
    { tk: "h6", icon: Trophy, color: "text-yellow-700 bg-yellow-200" },
  ];

  const compareRows = [
    {
      name: compareT("row1Name"),
      rate: compareT("row1Rate"),
      note: compareT("row1Note"),
      tone: "text-slate-500",
    },
    {
      name: compareT("row2Name"),
      rate: compareT("row2Rate"),
      note: compareT("row2Note"),
      tone: "text-amber-600",
    },
    {
      name: compareT("row3Name"),
      rate: compareT("row3Rate"),
      note: compareT("row3Note"),
      tone: "text-emerald-600 font-semibold",
      highlight: true,
    },
    {
      name: compareT("row4Name"),
      rate: compareT("row4Rate"),
      note: compareT("row4Note"),
      tone: "text-sky-600",
    },
  ];

  return (
    <section
      id="earn"
      className="relative border-y border-cream-edge bg-cream/40 py-20 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-bubble-lavender px-4 py-1.5 text-sm font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight md:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-5 text-balance text-base text-slate-600 dark:text-slate-300 md:text-lg">
            {t("subtitle")}
          </p>
        </div>

        {/* How it works */}
        <div className="mx-auto mt-14 max-w-5xl">
          <h3 className="text-center text-xl font-semibold">
            {t("howTitle")}
          </h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ titleKey, descKey, icon: Icon }) => (
              <div
                key={titleKey}
                className="rounded-2xl border border-cream-edge bg-paper p-5 dark:border-slate-700 dark:bg-slate-900"
              >
                <Icon className="mb-3 h-5 w-5 text-violet-600 dark:text-violet-400" />
                <h4 className="text-sm font-semibold">{t(titleKey)}</h4>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                  {t(descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 6 highlights */}
        <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {highlights.map(({ tk, icon: Icon, color }) => (
            <div
              key={tk}
              className="rounded-2xl border border-cream-edge bg-paper p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div
                className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl dark:bg-slate-800 dark:text-slate-200 ${color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <h4 className="text-base font-semibold">{t(`${tk}.title`)}</h4>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                {t(`${tk}.desc`)}
              </p>
            </div>
          ))}
        </div>

        {/* Compare table */}
        <div className="mx-auto mt-14 max-w-3xl">
          <h3 className="mb-4 text-center text-xl font-semibold">
            {t("compareTitle")}
          </h3>
          <div className="overflow-hidden rounded-2xl border border-cream-edge bg-paper dark:border-slate-700 dark:bg-slate-900">
            {compareRows.map((row, i) => (
              <div
                key={row.name}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  i > 0
                    ? "border-t border-cream-edge dark:border-slate-700"
                    : ""
                } ${
                  row.highlight
                    ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                    : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${
                      row.highlight
                        ? "font-semibold"
                        : "font-medium text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {row.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.note}</p>
                </div>
                <div
                  className={`flex-none text-right font-mono text-base ${row.tone} dark:text-slate-200`}
                >
                  {row.rate}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer + CTA */}
        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs text-amber-900 dark:text-amber-300">
            ⚠️ {t("disclaimer")}
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild size="lg" variant="outline">
            <a href="mailto:exfantasy7wolves@gmail.com?subject=Quiver%20Earn%20Beta%20申請">
              <Mail className="h-4 w-4" />
              {t("cta")}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Roadmap 4 個 phase */
function Roadmap() {
  const t = useTranslations("marketing.roadmap");
  const items = [
    { tk: "r1", color: "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20" },
    { tk: "r2", color: "border-violet-400 bg-violet-50/60 dark:bg-violet-950/20" },
    { tk: "r3", color: "border-sky-400 bg-sky-50/60 dark:bg-sky-950/20" },
    { tk: "r4", color: "border-slate-400 bg-slate-50/60 dark:bg-slate-900/40" },
  ];
  return (
    <section className="container py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {t("subtitle")}
        </p>
      </div>
      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {items.map(({ tk, color }) => (
          <div
            key={tk}
            className={`rounded-2xl border-l-4 border border-cream-edge p-5 dark:border-slate-700 ${color}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t(`${tk}Status`)}
                </p>
                <h3 className="mt-1 text-base font-semibold">{t(`${tk}Title`)}</h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  {t(`${tk}Desc`)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Trust signals */
function Trust() {
  const t = useTranslations("marketing.trust");
  const items = [
    { tk: "t1", icon: KeyRound },
    { tk: "t2", icon: ShieldCheck },
    { tk: "t3", icon: FileText },
    { tk: "t4", icon: Lock },
    { tk: "t5", icon: History },
  ];
  return (
    <section className="container border-t border-cream-edge py-16 dark:border-slate-800">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {t("subtitle")}
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map(({ tk, icon: Icon }) => (
          <div
            key={tk}
            className="rounded-2xl border border-cream-edge bg-paper p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <Icon className="mb-3 h-5 w-5 text-slate-600 dark:text-slate-300" />
            <h3 className="text-base font-semibold">{t(`${tk}Title`)}</h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {t(`${tk}Desc`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Final CTA */
function CtaFinal({ locale }: { locale: string }) {
  const t = useTranslations("marketing.ctaFinal");
  return (
    <section className="container py-20">
      <div className="mx-auto max-w-2xl rounded-3xl border border-cream-edge bg-bubble-mint p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-12">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 md:text-base">
          {t("subtitle")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href={`/${locale}/login`}>
              {t("primaryCta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="mailto:exfantasy7wolves@gmail.com?subject=Quiver%20Earn%20Beta%20申請">
              <Mail className="h-4 w-4" />
              {t("secondaryCta")}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-cream-edge py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      © 2026 Quiver
    </footer>
  );
}
