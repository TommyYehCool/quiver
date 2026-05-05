import { useTranslations } from "next-intl";
import { cookies } from "next/headers";
import Link from "next/link";
import { Gift } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { QuiverLogo } from "@/components/common/quiver-logo";
import { GoogleLoginButton } from "@/components/auth/google-login-button";

// F-5b-X: per-locale "you were invited by X" banner template. The {code}
// placeholder is replaced with the referrer's actual code (read from the
// pending_ref cookie set by the marketing landing page).
const REF_BANNER_STRINGS: Record<string, string> = {
  "zh-TW": "你被 {code} 邀請,登入後會自動綁定推薦關係。",
  en: "Invited by {code} — we'll bind the referral automatically after sign-in.",
  ja: "{code} に招待されました。ログイン後に紐付けが自動完了します。",
};

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

  // F-5b-X: surface the pending referral so the invitee feels acknowledged
  // before signing in. Cookie validation mirrors the regex used by the
  // backend and the RefCookieCapture component (4-12 [A-Z0-9]).
  const refCookie = cookies().get("pending_ref")?.value ?? null;
  const pendingRef =
    refCookie && /^[A-Z0-9]{4,12}$/.test(refCookie) ? refCookie : null;
  const refBannerTemplate =
    REF_BANNER_STRINGS[locale] ?? REF_BANNER_STRINGS["zh-TW"];
  const refBanner = pendingRef
    ? refBannerTemplate.replace("{code}", pendingRef)
    : null;

  return (
    <main className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <QuiverLogo size={36} />
          <span className="font-display text-lg font-bold tracking-tight">Quiver</span>
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
        </div>
      </header>

      <div className="container flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {refBanner ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                <Gift className="mt-0.5 h-4 w-4 flex-none" />
                <p>{refBanner}</p>
              </div>
            ) : null}
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

