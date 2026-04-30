"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, ArrowUpFromLine, Send } from "lucide-react";

import { ReceiveCard } from "@/components/wallet/receive-card";
import { TransferCard } from "@/components/wallet/transfer-card";
import { WithdrawCard } from "@/components/wallet/withdraw-card";
import { cn } from "@/lib/utils";

type Tab = "receive" | "send" | "withdraw";

const TABS: Array<{
  key: Tab;
  i18nKey: string;
  Icon: typeof Send;
}> = [
  { key: "receive", i18nKey: "tabReceive", Icon: ArrowDownToLine },
  { key: "send", i18nKey: "tabSend", Icon: Send },
  { key: "withdraw", i18nKey: "tabWithdraw", Icon: ArrowUpFromLine },
];

export function WalletTabs() {
  const t = useTranslations("wallet");
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryTab = (searchParams.get("tab") as Tab | null) ?? "receive";
  const tab: Tab = TABS.some((x) => x.key === queryTab) ? queryTab : "receive";

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="flex w-full flex-wrap gap-1 rounded-2xl border border-cream-edge bg-paper/50 p-1 dark:border-slate-700 dark:bg-slate-800/50"
      >
        {TABS.map(({ key, i18nKey, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              aria-controls={`wallet-panel-${key}`}
              id={`wallet-tab-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-paper text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:bg-paper/40 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(i18nKey)}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {tab === "receive" ? (
        <div role="tabpanel" id="wallet-panel-receive" aria-labelledby="wallet-tab-receive">
          <ReceiveCard />
        </div>
      ) : null}
      {tab === "send" ? (
        <div role="tabpanel" id="wallet-panel-send" aria-labelledby="wallet-tab-send">
          <TransferCard />
        </div>
      ) : null}
      {tab === "withdraw" ? (
        <div role="tabpanel" id="wallet-panel-withdraw" aria-labelledby="wallet-tab-withdraw">
          <WithdrawCard />
        </div>
      ) : null}
    </div>
  );
}
