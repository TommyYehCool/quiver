import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BalanceCard } from "@/components/wallet/balance-card";
import { WalletTabs } from "@/components/wallet/wallet-tabs";
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

export default async function WalletPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "wallet" });
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const kyc = await fetchKycStatus(cookieHeader);
  if (kyc?.status !== "APPROVED") {
    // 還沒過 KYC 不能用錢包功能,引導去 KYC
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
    </div>
  );
}
