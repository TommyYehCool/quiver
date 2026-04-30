import { getTranslations } from "next-intl/server";

import { AccountCard } from "@/components/account/account-card";
import { SessionsCard } from "@/components/account/sessions-card";

export default async function SettingsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "settings" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("desc")}</p>
      </div>
      <SessionsCard />
      <AccountCard />
    </div>
  );
}
