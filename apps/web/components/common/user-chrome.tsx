"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Bot,
  Crown,
  Gift,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
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

interface NavSection {
  /** i18n key for the section label, or null for an unlabelled top group. */
  labelKey: string | null;
  items: NavItem[];
}

interface UserChromeProps {
  locale: string;
  isAdmin: boolean;
  /** KYC 沒過時顯示「身分驗證」入口 */
  showKycEntry: boolean;
}

export function UserChrome({
  children,
  locale,
  isAdmin,
  showKycEntry,
}: React.PropsWithChildren<UserChromeProps>) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Close drawer on route change (URL changed → user navigated)
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Sectioned nav — sidebar can hold many more items than the old top nav.
  // Groups will scale as F-5a-3/4 add Market, Strategy, Rank, etc.
  const sections: NavSection[] = [
    {
      labelKey: null,
      items: [
        { href: `/${locale}/dashboard`, i18nKey: "dashboard", Icon: LayoutDashboard },
        { href: `/${locale}/wallet`, i18nKey: "wallet", Icon: Wallet },
      ],
    },
    {
      labelKey: "navSectionEarn",
      items: [
        { href: `/${locale}/earn`, i18nKey: "earn", Icon: TrendingUp },
        { href: `/${locale}/earn/strategy-lab`, i18nKey: "strategyLab", Icon: Sparkles },
        { href: `/${locale}/earn/bot-settings`, i18nKey: "botSettings", Icon: Bot },
        { href: `/${locale}/rank`, i18nKey: "rank", Icon: Trophy },
        { href: `/${locale}/subscription`, i18nKey: "premium", Icon: Crown },
      ],
    },
    {
      labelKey: "navSectionCommunity",
      items: [
        { href: `/${locale}/referral`, i18nKey: "referral", Icon: Gift },
        { href: `/${locale}/referral/invitees`, i18nKey: "inviteeList", Icon: Users },
        { href: `/${locale}/guide`, i18nKey: "guide", Icon: BookOpen },
      ],
    },
  ];

  // KYC stays in sidebar as a nav item when not yet approved (it's a workflow,
  // not a utility). Settings / admin badge / locale / logout moved to top-right
  // per F-5a-1.1 — standard SaaS pattern (Notion / Linear / Stripe).
  const accountItems: NavItem[] = [];
  if (showKycEntry) {
    accountItems.push({ href: `/${locale}/kyc`, i18nKey: "kyc", Icon: ShieldCheck });
  }

  // All registered hrefs across every section + accountItems — used to make
  // `isActive` longest-prefix-wins. Without this, `/earn/bot-settings` would
  // light up BOTH the `/earn` and `/earn/bot-settings` items because the
  // parent's startsWith check would match too.
  const allHrefs = React.useMemo(
    () => [
      ...sections.flatMap((s) => s.items.map((i) => i.href)),
      ...accountItems.map((i) => i.href),
    ],
    // sections + accountItems are recomputed every render but stable per
    // (locale, showKycEntry); the deps below drive recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, showKycEntry],
  );

  function isActive(href: string) {
    // Dashboard is exact-match only — `/dashboard/foo` doesn't exist but if
    // we ever add a sub-route, we'd want it to behave like `/earn` below.
    if (href.endsWith("/dashboard")) return pathname === href;
    const matches =
      pathname === href ||
      pathname.startsWith(href + "/") ||
      pathname.startsWith(href + "?");
    if (!matches) return false;
    // Longest-prefix-wins: another nav item is more specific → not us.
    const moreSpecific = allHrefs.some(
      (h) =>
        h !== href &&
        h.startsWith(href + "/") &&
        (pathname === h ||
          pathname.startsWith(h + "/") ||
          pathname.startsWith(h + "?")),
    );
    return !moreSpecific;
  }

  // ───────────────────────────────────────────────
  // Sidebar content (shared between desktop fixed + mobile drawer)
  // ───────────────────────────────────────────────
  const sidebarContent = (
    <>
      {/* Brand */}
      <Link
        href={`/${locale}/dashboard`}
        className="flex items-center gap-2 px-4 py-5"
        onClick={() => setMobileOpen(false)}
      >
        <QuiverLogo size={32} />
        <span className="font-display text-lg font-bold tracking-tight">Quiver</span>
      </Link>

      {/* Sectioned nav */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-2"
        aria-label="Primary navigation"
      >
        {sections.map((section, sectionIdx) => (
          <div key={sectionIdx} className={sectionIdx > 0 ? "mt-5" : ""}>
            {section.labelKey ? (
              <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t(section.labelKey)}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
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
          </div>
        ))}
      </nav>

      {/* Bottom: KYC entry (workflow item) only.
           Admin / Settings / locale / logout all live in top-right header. */}
      {accountItems.length > 0 ? (
        <div className="border-t border-cream-edge px-3 py-3 dark:border-slate-800">
          <ul className="space-y-0.5">
            {accountItems.map((item) => (
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
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {/* Macaron background blobs — fixed, low opacity, behind everything */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-20 h-[28rem] w-[28rem] rounded-full bg-macaron-peach opacity-50 blur-3xl dark:opacity-15" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-macaron-mint opacity-40 blur-3xl dark:opacity-10" />
        <div className="absolute -bottom-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-macaron-lavender opacity-40 blur-3xl dark:opacity-15" />
      </div>

      <div className="relative flex min-h-screen">
        {/* Desktop sidebar — fixed width, full-height column */}
        <aside
          className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-cream-edge bg-paper/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 md:flex"
          aria-label="Sidebar"
        >
          {sidebarContent}
        </aside>

        {/* Mobile drawer — slide-in from left, dimmed backdrop */}
        {mobileOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-cream-edge bg-paper shadow-xl dark:border-slate-800 dark:bg-slate-950 md:hidden"
              aria-label="Mobile sidebar"
            >
              {sidebarContent}
            </aside>
          </>
        ) : null}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Slim top header — hamburger (mobile) + utilities */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-cream-edge bg-paper/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            {/* Mobile: hamburger + brand */}
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
                <QuiverLogo size={28} />
                {/* F-5b-X.5 — wordmark hidden on narrow phones to leave
                    room for the right-side utility row (settings + bell +
                    locale switcher + logout). The Q logo alone reads as
                    Quiver from sm: up. */}
                <span className="hidden font-display text-base font-bold tracking-tight sm:inline">
                  Quiver
                </span>
              </Link>
            </div>

            {/* Desktop: spacer (sidebar already shows brand) */}
            <div className="hidden md:block" />

            {/* Right utilities — Settings / admin badge / bell / locale /
                 logout. Standard SaaS top-right pattern. */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href={`/${locale}/settings`}
                aria-label={t("settings")}
                title={t("settings")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <Settings className="h-5 w-5" />
              </Link>
              {isAdmin ? (
                <Link
                  href={`/${locale}/admin`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-200 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60 sm:px-3"
                  title={t("switchToAdmin")}
                  aria-label={t("switchToAdmin")}
                >
                  <UserCog className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{t("switchToAdmin")}</span>
                </Link>
              ) : null}
              <NotificationBell />
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
          ? "bg-macaron-mint text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
      )}
    >
      <Icon className="h-4 w-4 flex-none" />
      <span className="truncate">{t(item.i18nKey)}</span>
    </Link>
  );
}
