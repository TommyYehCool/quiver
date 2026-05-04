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

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
    if (href.endsWith("/admin")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Shared sidebar content used by desktop fixed sidebar + mobile drawer.
  const sidebarContent = (
    <>
      <Link
        href={`/${locale}/admin`}
        className="flex items-center gap-2 px-4 py-5"
        onClick={() => setMobileOpen(false)}
      >
        <QuiverLogo size={32} />
        <span className="font-display text-lg font-bold tracking-tight text-violet-900 dark:text-violet-200">
          Quiver Admin
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Admin navigation">
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink
                item={item}
                active={isActive(item.href)}
                t={t}
                onNavigate={() => setMobileOpen(false)}
              />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );

  return (
    <>
      {/* ADMIN MODE warning bar — full-width, top of viewport */}
      <div className="sticky top-0 z-40 flex items-center justify-center bg-violet-700 px-4 py-1.5 text-xs font-medium text-white dark:bg-violet-950">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("adminModeBanner")}
        </span>
      </div>

      <div className="relative flex min-h-screen">
        {/* Desktop sidebar */}
        <aside
          className="sticky top-7 hidden h-[calc(100vh-1.75rem)] w-60 shrink-0 flex-col border-r border-violet-200 bg-violet-50/80 backdrop-blur dark:border-violet-900 dark:bg-violet-950/60 lg:flex"
          aria-label="Admin sidebar"
        >
          {sidebarContent}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside
              className="fixed inset-y-7 left-0 z-50 flex w-72 flex-col border-r border-violet-200 bg-violet-50 shadow-xl dark:border-violet-900 dark:bg-violet-950 lg:hidden"
              aria-label="Mobile admin sidebar"
            >
              {sidebarContent}
            </aside>
          </>
        ) : null}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Slim top header */}
          <header className="sticky top-7 z-30 flex h-14 items-center justify-between gap-3 border-b border-violet-200 bg-violet-50/80 px-4 backdrop-blur dark:border-violet-900 dark:bg-violet-950/60">
            <div className="flex items-center gap-3 lg:hidden">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link href={`/${locale}/admin`} className="flex items-center gap-2">
                <QuiverLogo size={28} />
                <span className="font-display text-base font-bold tracking-tight text-violet-900 dark:text-violet-200">
                  Admin
                </span>
              </Link>
            </div>

            <div className="hidden lg:block" />

            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href={`/${locale}/dashboard`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-100/70 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("backToUser")}</span>
              </Link>
              <LocaleSwitcher />
              <LogoutButton locale={locale} />
            </div>
          </header>

          <main className="container py-8">{children}</main>
        </div>
      </div>
    </>
  );
}

function NavLink({
  item,
  active,
  t,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  t: ReturnType<typeof useTranslations>;
  onNavigate: () => void;
}) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-violet-200 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100"
          : "text-violet-700 hover:bg-violet-100 hover:text-violet-900 dark:text-violet-300 dark:hover:bg-violet-950 dark:hover:text-violet-100",
      )}
    >
      <Icon className="h-4 w-4 flex-none" />
      <span className="truncate">{t(item.i18nKey)}</span>
    </Link>
  );
}
