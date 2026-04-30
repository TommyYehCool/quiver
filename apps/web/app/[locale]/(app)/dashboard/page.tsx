import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Key, ShieldCheck, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BalanceCard } from "@/components/wallet/balance-card";
import { DevSimulator } from "@/components/admin/dev-simulator";
import { ReceiveCard } from "@/components/wallet/receive-card";
import { TransferCard } from "@/components/wallet/transfer-card";
import { WithdrawCard } from "@/components/wallet/withdraw-card";
import { fetchMeServer } from "@/lib/auth";

interface KycResp {
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface SetupResp {
  initialized: boolean;
  awaiting_verify: boolean;
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

async function fetchSetupStatus(cookieHeader: string): Promise<SetupResp | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/admin/setup/status`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: SetupResp };
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
  const setupStatus = isAdmin ? await fetchSetupStatus(cookieHeader) : null;
  const needsSetup = isAdmin && setupStatus !== null && !setupStatus.initialized;

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
      <Card className="bg-macaron-peach dark:bg-slate-900">
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

      <Card className="bg-macaron-mint dark:bg-slate-900">
        <CardHeader className="flex-row items-start gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-mint">
            <ShieldCheck className="h-6 w-6 text-emerald-700" />
          </span>
          <div className="flex-1">
            <CardTitle>{t("kycCard.title")}</CardTitle>
            <CardDescription>{kycCard.desc}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {kycCard.disabled ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100/60 px-5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              {kycCard.cta}
              <CheckCircle2 className="h-4 w-4" />
            </span>
          ) : (
            <Button asChild>
              <Link href={kycCard.href}>
                {kycCard.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {kyc?.status === "APPROVED" ? (
        <>
          <BalanceCard />
          <ReceiveCard />
          <TransferCard />
          <WithdrawCard />
          {isAdmin ? <DevSimulator userId={user.id} /> : null}
        </>
      ) : null}

      {needsSetup ? (
        <Card className="bg-macaron-rose dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-rose">
              <Key className="h-6 w-6 text-rose-700" />
            </span>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                系統初始化
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </CardTitle>
              <CardDescription>
                還未設定主加密金鑰 (KEK),Phase 3+ 功能無法使用。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/${locale}/admin/setup`}>
                前往設定 <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="bg-macaron-lavender dark:bg-slate-900">
          <CardHeader className="flex-row items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-lavender">
              <UserCog className="h-6 w-6 text-violet-700" />
            </span>
            <div className="flex-1">
              <CardTitle>{t("adminCard.title")}</CardTitle>
              <CardDescription>{t("adminCard.desc")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/admin/kyc`}>
                KYC 審核 <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/admin/withdrawals`}>
                提領審核 <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/admin/platform`}>
                平台帳戶 <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
