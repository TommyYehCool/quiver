import { cookies } from "next/headers";

import { UserChrome } from "@/components/common/user-chrome";
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

/**
 * 用戶介面 layout — 米色 chrome,primary nav 上方。
 * Auth check 已在 (app)/layout.tsx 做完。
 */
export default async function UserLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  const kyc = await fetchKycStatus(cookieHeader);
  const showKycEntry = kyc?.status !== "APPROVED";
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  return (
    <UserChrome locale={locale} isAdmin={isAdmin} showKycEntry={showKycEntry}>
      {children}
    </UserChrome>
  );
}
