import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AdminChrome } from "@/components/common/admin-chrome";
import { fetchMeServer } from "@/lib/auth";

interface SetupResp {
  initialized: boolean;
  awaiting_verify: boolean;
}

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function fetchSetupStatus(cookieHeader: string): Promise<SetupResp | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/admin/setup/status`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: SetupResp };
  return wrapped.success ? wrapped.data ?? null : null;
}

/**
 * 管理員介面 layout — 紫色 chrome,ADMIN MODE 警示條 + 切回用戶介面 link。
 * Auth 已在 (app)/layout.tsx 做完;這裡額外擋非 admin。
 */
export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user || !user.roles.includes("ADMIN")) {
    redirect(`/${locale}/dashboard`);
  }

  const setupStatus = await fetchSetupStatus(cookieHeader);
  const needsSetup = setupStatus !== null && !setupStatus.initialized;

  return (
    <AdminChrome locale={locale} needsSetup={needsSetup}>
      {children}
    </AdminChrome>
  );
}
