import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Coins, Send, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { ThemeToggle } from "@/components/common/theme-toggle";

export default function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return (
    // 用 paper(暖白)蓋掉 globals 的 cream(偏冷淡紫),並加馬卡龍 blob 暈染
    <main className="relative min-h-screen overflow-hidden bg-paper dark:bg-slate-950">
      <MacaronBlobs />
      <div className="relative">
        <Header locale={locale} />
        <Hero locale={locale} />
        <Features />
        <Footer />
      </div>
    </main>
  );
}

/**
 * 三顆模糊色塊充當背景裝飾,呼應後台 dashboard 的多彩馬卡龍。
 * pointer-events-none 確保不擋滑鼠互動。
 */
function MacaronBlobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
        <div className="h-8 w-8 rounded-xl bg-brand-gradient" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">Quiver</span>
      </Link>
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
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
        {/* 軟質地的 mint badge,加一點品牌氣質 */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-macaron-mint px-4 py-1.5 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Sparkles className="h-3.5 w-3.5" />
          {t("badge")}
        </div>

        <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight md:text-6xl">
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

/**
 * 三張卡片各一個馬卡龍色,呼應登入後 dashboard 的多彩風格。
 * - peach + amber → 收款 / 餘額(同登入後 BalanceCard 旁邊的元素)
 * - mint + emerald → 轉帳(同登入後 BalanceCard)
 * - lavender + violet → gas 代付(同登入後 admin lavender)
 */
function Features() {
  const t = useTranslations("marketing.features");
  const items = [
    {
      icon: Coins,
      key: "f1",
      cardClass: "bg-macaron-peach dark:bg-slate-900",
      iconBgClass: "bg-bubble-peach text-amber-700",
    },
    {
      icon: Send,
      key: "f2",
      cardClass: "bg-macaron-mint dark:bg-slate-900",
      iconBgClass: "bg-bubble-mint text-emerald-700",
    },
    {
      icon: Zap,
      key: "f3",
      cardClass: "bg-macaron-lavender dark:bg-slate-900",
      iconBgClass: "bg-bubble-lavender text-violet-700",
    },
  ] as const;

  return (
    <section id="features" className="container py-16">
      <div className="grid gap-6 md:grid-cols-3">
        {items.map(({ icon: Icon, key, cardClass, iconBgClass }) => (
          <div
            key={key}
            className={`rounded-2xl border border-cream-edge p-6 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 ${cardClass}`}
          >
            <div
              className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl dark:bg-slate-800 dark:text-slate-200 ${iconBgClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t(`${key}.desc`)}
            </p>
          </div>
        ))}
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
