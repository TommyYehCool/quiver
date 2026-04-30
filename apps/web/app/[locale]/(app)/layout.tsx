import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Settings } from "lucide-react";

import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { NotificationBell } from "@/components/common/notification-bell";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { LogoutButton } from "@/components/common/logout-button";
import { TosGate } from "@/components/legal/tos-gate";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { fetchMeServer } from "@/lib/auth";

export default async function AppLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <ConfirmProvider>
      <div className="min-h-screen">
        <header className="container flex h-16 items-center justify-between">
          <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-brand-gradient" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">Quiver</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link
              href={`/${locale}/settings`}
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <LocaleSwitcher />
            <ThemeToggle />
            <LogoutButton locale={locale} />
          </div>
        </header>
        <main className="container py-8">{children}</main>
        <TosGate locale={locale} />
      </div>
    </ConfirmProvider>
  );
}
