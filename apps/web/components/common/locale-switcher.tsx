"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { startTransition } from "react";

import { Button } from "@/components/ui/button";
import { locales, type Locale } from "@/i18n";

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();

  const switchTo = (next: Locale) => {
    if (next === currentLocale) return;
    const segments = pathname.split("/");
    segments[1] = next;
    startTransition(() => {
      router.replace(segments.join("/"));
    });
  };

  return (
    <div className="flex items-center gap-1 rounded-xl border border-cream-edge bg-paper p-1 dark:border-slate-700 dark:bg-slate-900">
      <Globe className="ml-2 h-4 w-4 text-slate-400" aria-hidden />
      {locales.map((loc) => (
        <Button
          key={loc}
          variant={loc === currentLocale ? "default" : "ghost"}
          size="sm"
          onClick={() => switchTo(loc)}
          aria-label={t("switch")}
        >
          {t(loc)}
        </Button>
      ))}
    </div>
  );
}
