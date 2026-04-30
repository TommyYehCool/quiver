import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { TosGate } from "@/components/legal/tos-gate";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { fetchMeServer } from "@/lib/auth";

/**
 * 共用層 — auth check + global modals (TOS gate, Confirm dialogs)。
 * 不渲染 header,讓子 layout (`(user)/layout.tsx` 或 `admin/layout.tsx`) 各自渲染對應 chrome。
 */
export default async function AppLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <ConfirmProvider>
      <div className="min-h-screen">
        {children}
        <TosGate locale={locale} />
      </div>
    </ConfirmProvider>
  );
}
