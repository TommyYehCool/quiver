"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Crown,
  Gift,
  LayoutDashboard,
  Menu,
  Settings,
  Shield,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Wallet,
  X,
} from "lucide-react";

import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { LogoutButton } from "@/components/common/logout-button";
import { NotificationBell } from "@/components/common/notification-bell";
import { QuiverLogo } from "@/components/common/quiver-logo";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  i18nKey: string;
  Icon: typeof Wallet;
}

interface UserChromeProps {
  locale: string;
  isAdmin: boolean;
  /** KYC 沒過時顯示「身分驗證」入口 */
  showKycEntry: boolean;
}

export function UserChrome({ children, locale, isAdmin, showKycEntry }: React.PropsWithChildren<UserChromeProps>) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const items: NavItem[] = [
    { href: `/${locale}/dashboard`, i18nKey: "dashboard", Icon: LayoutDashboard },
    { href: `/${locale}/wallet`, i18nKey: "wallet", Icon: Wallet },
    { href: `/${locale}/earn`, i18nKey: "earn", Icon: TrendingUp },
    { href: `/${locale}/subscription`, i18nKey: "premium", Icon: Crown },
    { href: `/${locale}/referral`, i18nKey: "referral", Icon: Gift },
    { href: `/${locale}/guide`, i18nKey: "guide", Icon: BookOpen },
  ];
  if (showKycEntry) {
    items.push({ href: `/${locale}/kyc`, i18nKey: "kyc", Icon: ShieldCheck });
  }

  function isActive(href: string) {
    // exact match for /dashboard, prefix for sections (/wallet/...)
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href + "?");
  }

  return (
    <>
      {/* 馬卡龍背景暈染 — fixed 跟著 viewport 不隨滾動,opacity 低不打擾閱讀
           不放 -z 避免被 body bg 蓋掉,改靠 pointer-events-none + 後續 header/main 自然疊在上面 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-20 h-[28rem] w-[28rem] rounded-full bg-macaron-peach opacity-50 blur-3xl dark:opacity-15" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-macaron-mint opacity-40 blur-3xl dark:opacity-10" />
        <div className="absolute -bottom-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-macaron-lavender opacity-40 blur-3xl dark:opacity-15" />
      </div>

      <header className="sticky top-0 z-30 border-b border-cream-edge bg-paper/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="container flex h-16 items-center justify-between gap-3">
          {/* Logo + primary nav */}
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
              <QuiverLogo size={36} />
              <span className="hidden font-display text-lg font-bold tracking-tight sm:inline">Quiver</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {items.map((it) => (
                <NavLink key={it.href} item={it} active={isActive(it.href)} t={t} />
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2">
            {isAdmin ? (
              <Link
                href={`/${locale}/admin`}
                className="hidden items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-200 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60 sm:inline-flex"
                title={t("switchToAdmin")}
              >
                <UserCog className="h-3.5 w-3.5" />
                {t("switchToAdmin")}
              </Link>
            ) : null}
            <NotificationBell />
            {/* Settings + LocaleSwitcher + Logout 在 mobile 收進 drawer */}
            <Link
              href={`/${locale}/settings`}
              aria-label="Settings"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 md:flex"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <div className="hidden md:block">
              <LocaleSwitcher />
            </div>
            <div className="hidden md:block">
              <LogoutButton locale={locale} />
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="border-t border-cream-edge bg-paper px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile primary">
              {items.map((it) => (
                <NavLink key={it.href} item={it} active={isActive(it.href)} t={t} mobile onClose={() => setMobileOpen(false)} />
              ))}
              {isAdmin ? (
                <Link
                  href={`/${locale}/admin`}
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-100 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                >
                  <UserCog className="h-4 w-4" />
                  {t("switchToAdmin")}
                </Link>
              ) : null}

              {/* Mobile-only:把 desktop header 右側的工具收進來 */}
              <div className="mt-3 border-t border-cream-edge pt-3 dark:border-slate-800">
                <Link
                  href={`/${locale}/settings`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-cream/60 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <div className="mt-2 flex items-center justify-between gap-2 px-1">
                  <LocaleSwitcher />
                  <LogoutButton locale={locale} />
                </div>
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
          ? "bg-macaron-mint text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
      )}
    >
      <Icon className="h-4 w-4" />
      {t(item.i18nKey)}
    </Link>
  );
}
