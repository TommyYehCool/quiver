import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import { KycForm } from "@/components/kyc/kyc-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";

interface KycResp {
  id: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function fetchMyKycServer(cookieHeader: string): Promise<KycResp | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/kyc/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: KycResp | null };
  return wrapped.success ? wrapped.data ?? null : null;
}

export default async function KycPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations("kyc");
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const submission = await fetchMyKycServer(cookieHeader);

  if (submission?.status === "APPROVED") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>{t("approved.title")}</CardTitle>
          <CardDescription>{t("approved.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/${locale}/dashboard`}>{t("approved.backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (submission?.status === "PENDING") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>{t("pending.title")}</CardTitle>
          <CardDescription>{t("pending.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/${locale}/dashboard`}>{t("pending.backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <KycForm
      locale={locale}
      previousReason={submission?.status === "REJECTED" ? submission.reject_reason : null}
    />
  );
}
