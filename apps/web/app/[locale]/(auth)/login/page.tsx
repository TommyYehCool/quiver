import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { ThemeToggle } from "@/components/common/theme-toggle";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
            <Button asChild size="lg" className="w-full" variant="outline">
              <a href={`${API_BASE_URL}/api/auth/google/login?locale=${locale}`}>
                <GoogleIcon />
                {t("googleButton")}
              </a>
            </Button>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              {t("termsNote")}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.07-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2a7.1 7.1 0 0 1-6.7-4.9H1.3v3a12 12 0 0 0 10.7 6.6z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.3a12 12 0 0 0 0 10.7l4-3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.7l4 3a7.1 7.1 0 0 1 6.7-5z"
      />
    </svg>
  );
}
