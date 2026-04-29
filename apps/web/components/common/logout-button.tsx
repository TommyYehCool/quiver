"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api";

export function LogoutButton({ locale }: { locale: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handle = async () => {
    setPending(true);
    try {
      await logout();
      router.push(`/${locale}/login`);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={pending}>
      <LogOut className="h-4 w-4" />
      {t("logout")}
    </Button>
  );
}
