import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { TosGate } from "@/components/legal/tos-gate";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { RefBindOnLogin } from "@/components/referral/ref-bind-on-login";
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
        {/* F-5b-X: post-login ref-cookie consumer. Reads pending_ref
            cookie set by marketing-page RefCookieCapture, calls bind
            API, clears cookie. No-op when no cookie / already bound. */}
        <RefBindOnLogin />
        {children}
        <TosGate locale={locale} />
      </div>
    </ConfirmProvider>
  );
}
