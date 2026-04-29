import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations("dashboard");
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);

  if (!user) redirect(`/${locale}/login`);

  const isAdmin = user.roles.includes("ADMIN");

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
        <CardContent className="flex items-start gap-4 pt-6">
          <Sparkles className="mt-1 h-5 w-5 flex-none text-brand" />
          <div>
            <p className="font-medium">{t("phaseNotice")}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {locale === "zh-TW" ? (
                <>後續會加入：餘額顯示、收款碼、KYC、互轉、提領、紀錄。</>
              ) : (
                <>Coming next: balances, receive QR, KYC, transfers, withdrawals, history.</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
