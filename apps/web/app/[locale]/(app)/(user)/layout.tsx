import { cookies } from "next/headers";

import { UserChrome } from "@/components/common/user-chrome";
import { fetchMyKycStatusServer } from "@/lib/api/kyc-server";
import { fetchMeServer } from "@/lib/auth";

/**
 * 用戶介面 layout — 米色 chrome,primary nav 上方。
 * Auth check 已在 (app)/layout.tsx 做完。
 *
 * 平行抓 user + kyc 一次到位(並用 React.cache 避免跟其他 layouts/pages 重複請求)。
 */
export default async function UserLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const [user, kyc] = await Promise.all([
    fetchMeServer(cookieHeader),
    fetchMyKycStatusServer(cookieHeader),
  ]);
  const showKycEntry = kyc?.status !== "APPROVED";
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  return (
    <UserChrome locale={locale} isAdmin={isAdmin} showKycEntry={showKycEntry}>
      {children}
    </UserChrome>
  );
}
