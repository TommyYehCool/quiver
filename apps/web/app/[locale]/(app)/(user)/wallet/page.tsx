import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BalanceCard } from "@/components/wallet/balance-card";
import { RecentActivityCard } from "@/components/wallet/recent-activity-card";
import { WalletTabs } from "@/components/wallet/wallet-tabs";
import { fetchMyKycStatusServer } from "@/lib/api/kyc-server";

export default async function WalletPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "wallet" });
  const cookieHeader = cookies().toString();

  // (app)/layout 已驗 auth、(user)/layout 已抓 kyc — 這裡的 fetch 會 React.cache hit,
  // 不會多打 HTTP。沒過 KYC 引導去 /kyc。
  const kyc = await fetchMyKycStatusServer(cookieHeader);
  if (kyc?.status !== "APPROVED") {
    redirect(`/${locale}/kyc`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("pageDesc")}</p>
      </div>
      <BalanceCard />
      <WalletTabs />
      <RecentActivityCard />
    </div>
  );
}
