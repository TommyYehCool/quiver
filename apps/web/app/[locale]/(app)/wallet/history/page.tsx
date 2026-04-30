import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeServer } from "@/lib/auth";
import { HistoryTable } from "@/components/wallet/history-table";

interface ActivityListResp {
  items: ActivityItem[];
  total: number;
  page: number;
  page_size: number;
}

interface ActivityItem {
  id: string;
  type: "DEPOSIT" | "TRANSFER_IN" | "TRANSFER_OUT";
  amount: string;
  currency: string;
  status: string;
  note: string | null;
  counterparty_email: string | null;
  counterparty_display_name: string | null;
  tx_hash: string | null;
  created_at: string;
}

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function fetchHistoryServer(
  cookieHeader: string,
  opts: { type?: string; page: number; pageSize: number },
): Promise<ActivityListResp | null> {
  const params = new URLSearchParams();
  if (opts.type && opts.type !== "all") params.set("type", opts.type);
  params.set("page", String(opts.page));
  params.set("page_size", String(opts.pageSize));
  const res = await fetch(
    `${SERVER_API_BASE_URL}/api/wallet/history?${params.toString()}`,
    { headers: { Cookie: cookieHeader }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: ActivityListResp };
  return wrapped.success && wrapped.data ? wrapped.data : null;
}

export default async function HistoryPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { type?: string; page?: string };
}) {
  const t = await getTranslations("history");
  const cookieHeader = cookies().toString();
  const user = await fetchMeServer(cookieHeader);
  if (!user) redirect(`/${locale}/login`);

  const filterType = searchParams.type ?? "all";
  const page = Number(searchParams.page) || 1;
  const pageSize = 20;

  const data = await fetchHistoryServer(cookieHeader, {
    type: filterType,
    page,
    pageSize,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const filters: { value: string; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "DEPOSIT", label: t("filterDeposit") },
    { value: "TRANSFER", label: t("filterTransfer") },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/${locale}/dashboard`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const active = filterType === f.value;
          const params = new URLSearchParams();
          if (f.value !== "all") params.set("type", f.value);
          params.set("page", "1");
          return (
            <Link
              key={f.value}
              href={`/${locale}/wallet/history${
                params.toString() ? `?${params.toString()}` : ""
              }`}
              className={
                active
                  ? "rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-medium text-white"
                  : "rounded-full border border-cream-edge bg-paper px-4 py-1.5 text-xs text-slate-600 hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>{t("totalCount", { n: data?.total ?? 0 })}</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.items.length > 0 ? (
            <HistoryTable items={data.items} t={{
              typeDeposit: t("typeDeposit"),
              typeTransferIn: t("typeTransferIn"),
              typeTransferOut: t("typeTransferOut"),
              statusPending: t("statusPending"),
              statusPosted: t("statusPosted"),
              empty: t("empty"),
            }} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{t("empty")}</p>
          )}

          {totalPages > 1 ? (
            <div className="mt-4 flex justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const params = new URLSearchParams();
                if (filterType !== "all") params.set("type", filterType);
                params.set("page", String(p));
                return (
                  <Link
                    key={p}
                    href={`/${locale}/wallet/history?${params.toString()}`}
                    className={
                      p === page
                        ? "rounded-md bg-brand px-3 py-1 text-white"
                        : "rounded-md border border-cream-edge bg-paper px-3 py-1 text-slate-600 hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }
                  >
                    {p}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
