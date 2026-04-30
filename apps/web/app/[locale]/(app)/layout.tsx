import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { NotificationBell } from "@/components/common/notification-bell";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { LogoutButton } from "@/components/common/logout-button";
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
    <div className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-brand-gradient" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Quiver</span>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <LocaleSwitcher />
          <ThemeToggle />
          <LogoutButton locale={locale} />
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
