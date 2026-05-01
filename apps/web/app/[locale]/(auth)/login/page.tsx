import { useTranslations } from "next-intl";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { GoogleLoginButton } from "@/components/auth/google-login-button";

export default function LoginPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { auth_error?: string };
}) {
  const t = useTranslations("login");

  const errorKey = searchParams.auth_error;
  const errorMessage =
    errorKey && (errorKey === "oauth_failed" || errorKey === "email_unverified")
      ? t(`errors.${errorKey}`)
      : null;

  return (
    <main className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-brand-gradient" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Quiver</span>
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <div className="container flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {errorMessage}
              </div>
            ) : null}
            <GoogleLoginButton locale={locale} label={t("googleButton")} />
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              {t("termsNote")}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

