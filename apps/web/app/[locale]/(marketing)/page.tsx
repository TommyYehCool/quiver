import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Coins, Send, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { ThemeToggle } from "@/components/common/theme-toggle";

export default function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return (
    <main className="min-h-screen">
      <Header locale={locale} />
      <Hero locale={locale} />
      <Features />
      <Footer />
    </main>
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

function Features() {
  const t = useTranslations("marketing.features");
  const items = [
    { icon: Coins, key: "f1" },
    { icon: Send, key: "f2" },
    { icon: Zap, key: "f3" },
  ] as const;
  return (
    <section id="features" className="container py-16">
      <div className="grid gap-6 md:grid-cols-3">
        {items.map(({ icon: Icon, key }) => (
          <div
            key={key}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
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
    <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      © 2026 Quiver
    </footer>
  );
}
