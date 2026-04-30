import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AdminChrome } from "@/components/common/admin-chrome";
import { fetchSetupStatusServer } from "@/lib/api/setup-server";
import { fetchMeServer } from "@/lib/auth";

/**
 * 管理員介面 layout — 紫色 chrome,ADMIN MODE 警示條 + 切回用戶介面 link。
 * Auth 已在 (app)/layout.tsx 做完;這裡額外擋非 admin。
 *
 * 平行抓 user + setup,React.cache 也 dedupe 跟其他層級重複的 fetch。
 */
export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const [user, setupStatus] = await Promise.all([
    fetchMeServer(cookieHeader),
    fetchSetupStatusServer(cookieHeader),
  ]);
  if (!user || !user.roles.includes("ADMIN")) {
    redirect(`/${locale}/dashboard`);
  }

  const needsSetup = setupStatus !== null && !setupStatus.initialized;

  return (
    <AdminChrome locale={locale} needsSetup={needsSetup}>
      {children}
    </AdminChrome>
  );
}
