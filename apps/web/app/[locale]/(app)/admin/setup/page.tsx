import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { SetupWizard } from "@/components/admin/setup-wizard";

interface SetupStatus {
  initialized: boolean;
  awaiting_verify: boolean;
  kek_present_in_env: boolean;
  kek_matches_db: boolean | null;
}

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function fetchStatusServer(cookieHeader: string): Promise<SetupStatus | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/admin/setup/status`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: SetupStatus };
  return wrapped.success && wrapped.data ? wrapped.data : null;
}

export default async function AdminSetupPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);
  if (!user.roles.includes("ADMIN")) redirect(`/${locale}/dashboard`);

  const status = await fetchStatusServer(cookieHeader);

  if (status?.initialized) {
    return (
      <Card className="mx-auto max-w-2xl bg-macaron-mint dark:bg-slate-900">
        <CardHeader>
          <CardTitle>系統已初始化</CardTitle>
          <CardDescription>
            KEK 已設置完成。env 與 DB 的 hash {status.kek_matches_db ? "一致 ✓" : "不一致 ✗"}。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            如果需要重設 KEK,請聯絡開發人員 — 重設會讓所有加密資料無法解密。
          </p>
        </CardContent>
      </Card>
    );
  }

  return <SetupWizard locale={locale} initialStatus={status} />;
}
