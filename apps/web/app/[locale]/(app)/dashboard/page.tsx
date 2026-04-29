import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";

interface KycResp {
  status: "PENDING" | "APPROVED" | "REJECTED";
}

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function fetchKycStatus(cookieHeader: string): Promise<KycResp | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/kyc/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: KycResp | null };
  return wrapped.success ? wrapped.data ?? null : null;
}

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations("dashboard");
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const kyc = await fetchKycStatus(cookieHeader);
  const isAdmin = user.roles.includes("ADMIN");

  const kycCard = (() => {
    if (!kyc) {
      return {
        desc: t("kycCard.descNew"),
        cta: t("kycCard.ctaNew"),
        href: `/${locale}/kyc`,
        disabled: false,
      };
    }
    if (kyc.status === "PENDING") {
      return {
        desc: t("kycCard.descPending"),
        cta: t("kycCard.ctaPending"),
        href: `/${locale}/kyc`,
        disabled: false,
      };
    }
    if (kyc.status === "APPROVED") {
      return {
        desc: t("kycCard.descApproved"),
        cta: t("kycCard.ctaApproved"),
        href: `/${locale}/kyc`,
        disabled: true,
      };
    }
    return {
      desc: t("kycCard.descRejected"),
      cta: t("kycCard.ctaRejected"),
      href: `/${locale}/kyc`,
      disabled: false,
    };
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <Card>
        <CardHeader className="flex-row items-center gap-4">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.display_name ?? user.email}
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-brand-gradient" aria-hidden />
          )}
          <div className="flex-1">
            <CardTitle>
              {t("greeting", { name: user.display_name ?? user.email })}
            </CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
          {isAdmin ? (
            <span className="rounded-full bg-amber/20 px-3 py-1 text-xs font-medium text-amber">
              ADMIN
            </span>
          ) : null}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start gap-4">
          <ShieldCheck className="mt-1 h-6 w-6 flex-none text-brand" />
          <div className="flex-1">
            <CardTitle>{t("kycCard.title")}</CardTitle>
            <CardDescription>{kycCard.desc}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild={!kycCard.disabled} disabled={kycCard.disabled} variant={kycCard.disabled ? "outline" : "default"}>
            {kycCard.disabled ? (
              <span>{kycCard.cta}</span>
            ) : (
              <Link href={kycCard.href}>
                {kycCard.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </Button>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader className="flex-row items-start gap-4">
            <UserCog className="mt-1 h-6 w-6 flex-none text-amber" />
            <div className="flex-1">
              <CardTitle>{t("adminCard.title")}</CardTitle>
              <CardDescription>{t("adminCard.desc")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/${locale}/admin/kyc`}>
                {t("adminCard.cta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex items-start gap-4 pt-6">
          <Sparkles className="mt-1 h-5 w-5 flex-none text-brand" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("phaseNotice")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
