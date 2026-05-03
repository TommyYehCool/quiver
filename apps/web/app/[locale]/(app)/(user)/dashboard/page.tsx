import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Key, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BalanceCard } from "@/components/wallet/balance-card";
import { RecentActivityCard } from "@/components/wallet/recent-activity-card";
import { DevSimulator } from "@/components/admin/dev-simulator";
import { fetchMyKycStatusServer } from "@/lib/api/kyc-server";
import { fetchSetupStatusServer } from "@/lib/api/setup-server";
import { fetchMeServer } from "@/lib/auth";

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations("dashboard");
  const cookieHeader = cookies().toString();

  // 平行抓三件事,React.cache 也讓重複的 user/kyc 請求合併成單次。
  // user / kyc 都已經被 (app)/(user) layouts 抓過,這裡 cache 命中是 free。
  const [user, kyc, setupStatus] = await Promise.all([
    fetchMeServer(cookieHeader),
    fetchMyKycStatusServer(cookieHeader),
    fetchSetupStatusServer(cookieHeader),
  ]);
  if (!user) redirect(`/${locale}/login`);

  const isAdmin = user.roles.includes("ADMIN");
  const needsSetup = isAdmin && setupStatus !== null && !setupStatus.initialized;

  const isApproved = kyc?.status === "APPROVED";

  // KYC card 只在「未通過」時顯示;已通過就不再佔位,改在右上 nav 看得到
  const kycCard = (() => {
    if (isApproved) return null;
    if (!kyc) {
      return {
        desc: t("kycCard.descNew"),
        cta: t("kycCard.ctaNew"),
        href: `/${locale}/kyc`,
      };
    }
    if (kyc.status === "PENDING") {
      return {
        desc: t("kycCard.descPending"),
        cta: t("kycCard.ctaPending"),
        href: `/${locale}/kyc`,
      };
    }
    return {
      desc: t("kycCard.descRejected"),
      cta: t("kycCard.ctaRejected"),
      href: `/${locale}/kyc`,
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

      {kycCard ? (
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
            <Button asChild>
              <Link href={kycCard.href}>
                {kycCard.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isApproved ? (
        <>
          <BalanceCard />

          {/* Wallet 操作入口 — 卡內按鈕導去 /wallet 子頁(tabs:收款 / 轉帳 / 提領) */}
          <Card className="bg-macaron-cream dark:bg-slate-900">
            <CardHeader className="flex-row items-start gap-4">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-cream">
                <Wallet className="h-6 w-6 text-amber-700" />
              </span>
              <div className="flex-1">
                <CardTitle>{t("walletCard.title")}</CardTitle>
                <CardDescription>{t("walletCard.desc")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/${locale}/wallet?tab=receive`}>
                  {t("walletCard.receive")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${locale}/wallet?tab=send`}>
                  {t("walletCard.send")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${locale}/wallet?tab=withdraw`}>
                  {t("walletCard.withdraw")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 最近活動 — 從 BalanceCard 拆出來,放在錢包操作下方 */}
          <RecentActivityCard />

          {isAdmin && process.env.NEXT_PUBLIC_ENV !== "mainnet" ? (
            <DevSimulator userId={user.id} />
          ) : null}
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
    </div>
  );
}
