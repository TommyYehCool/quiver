"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Coins,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Menu,
  ShieldCheck,
  UserMinus,
  X,
} from "lucide-react";

import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { LogoutButton } from "@/components/common/logout-button";
import { QuiverLogo } from "@/components/common/quiver-logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  i18nKey: string;
  Icon: typeof ShieldCheck;
}

interface AdminChromeProps {
  locale: string;
  needsSetup: boolean;
}

export function AdminChrome({
  children,
  locale,
  needsSetup,
}: React.PropsWithChildren<AdminChromeProps>) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const items: NavItem[] = [
    { href: `/${locale}/admin`, i18nKey: "adminOverview", Icon: Gauge },
    { href: `/${locale}/admin/kyc`, i18nKey: "adminKyc", Icon: ShieldCheck },
    { href: `/${locale}/admin/withdrawals`, i18nKey: "adminWithdrawals", Icon: ClipboardList },
    { href: `/${locale}/admin/earn`, i18nKey: "adminEarn", Icon: Coins },
    { href: `/${locale}/admin/platform`, i18nKey: "adminPlatform", Icon: Database },
    { href: `/${locale}/admin/audit`, i18nKey: "adminAudit", Icon: FileText },
    { href: `/${locale}/admin/deletion-requests`, i18nKey: "adminDeletions", Icon: UserMinus },
  ];
  if (needsSetup) {
    items.push({ href: `/${locale}/admin/setup`, i18nKey: "adminSetup", Icon: KeyRound });
  }

  function isActive(href: string) {
    // exact match for /admin (overview), prefix for sub-sections
    if (href.endsWith("/admin")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* ADMIN MODE warning bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-violet-700 px-4 py-1.5 text-xs font-medium text-white dark:bg-violet-950">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("adminModeBanner")}
        </span>
        <Link
          href={`/${locale}/dashboard`}
          className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] hover:bg-white/25"
        >
          <ArrowLeft className="h-3 w-3" />
          {t("backToUser")}
        </Link>
      </div>

      <header className="sticky top-7 z-30 border-b border-violet-200 bg-violet-50/90 backdrop-blur dark:border-violet-900 dark:bg-violet-950/60">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/admin`} className="flex items-center gap-2">
              <QuiverLogo size={36} />
              <span className="hidden font-display text-lg font-bold tracking-tight text-violet-900 dark:text-violet-200 sm:inline">
                Quiver Admin
              </span>
            </Link>
            <nav className="hidden flex-wrap items-center gap-1 lg:flex" aria-label="Admin primary">
              {items.map((it) => (
                <NavLink key={it.href} item={it} active={isActive(it.href)} t={t} />
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden lg:block">
              <LocaleSwitcher />
            </div>
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            <div className="hidden lg:block">
              <LogoutButton locale={locale} />
            </div>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950 lg:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950 lg:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile admin">
              {items.map((it) => (
                <NavLink
                  key={it.href}
                  item={it}
                  active={isActive(it.href)}
                  t={t}
                  mobile
                  onClose={() => setMobileOpen(false)}
                />
              ))}

              {/* Mobile-only:把 desktop header 右側的工具收進來 */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-violet-200 pt-3 px-1 dark:border-violet-900">
                <LocaleSwitcher />
                <ThemeToggle />
                <LogoutButton locale={locale} />
              </div>
            </nav>
          </div>
        ) : null}
      </header>
      <main className="container py-8">{children}</main>
    </>
  );
}

function NavLink({
  item,
  active,
  t,
  mobile,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  t: ReturnType<typeof useTranslations>;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        mobile ? "w-full" : "",
        active
          ? "bg-violet-200 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100"
          : "text-violet-700 hover:bg-violet-100 hover:text-violet-900 dark:text-violet-300 dark:hover:bg-violet-950 dark:hover:text-violet-100",
      )}
    >
      <Icon className="h-4 w-4" />
      {t(item.i18nKey)}
    </Link>
  );
}
