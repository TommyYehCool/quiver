"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Globe } from "lucide-react";
import { startTransition } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

import { Button } from "@/components/ui/button";
import { locales, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Locale switcher with two layouts:
 *
 *   - Desktop (sm+):    full pill row with Globe + 3 language buttons
 *   - Mobile  (<sm):    icon button + dropdown — saves ~180px of width
 *                       which was previously pushing the chrome header
 *                       off-screen on iPhone-sized viewports.
 */
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
    <>
      {/* Desktop (sm+) — full row */}
      <div className="hidden items-center gap-1 rounded-xl border border-cream-edge bg-paper p-1 dark:border-slate-700 dark:bg-slate-900 sm:flex">
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

      {/* Mobile (<sm) — compact dropdown */}
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-cream-edge bg-paper px-2 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 sm:hidden"
            aria-label={t("switch")}
          >
            <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <span>{t(currentLocale)}</span>
            <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            sideOffset={4}
            align="end"
            className="z-50 min-w-[140px] rounded-md border border-cream-edge bg-paper p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {locales.map((loc) => (
              <Dropdown.Item
                key={loc}
                onSelect={() => switchTo(loc)}
                className={cn(
                  "cursor-pointer rounded px-3 py-2 text-sm outline-none focus:bg-slate-100 dark:focus:bg-slate-800",
                  loc === currentLocale
                    ? "bg-violet-100 font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                {t(loc)}
              </Dropdown.Item>
            ))}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </>
  );
}
