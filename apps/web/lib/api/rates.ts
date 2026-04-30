"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api";

export interface Rate {
  pair: string;
  rate: string; // Decimal string from server
  fetched_at: string;
  source: string;
}

export async function fetchUsdtTwdRate(): Promise<Rate> {
  return apiFetch<Rate>("/api/rates/usdt-twd");
}

/**
 * 取得 USDT/TWD 匯率,每 60s 自動 refresh。Server 端也已 cache 60s,所以這只是 UI 觸發頻率。
 * 載入失敗回 null,UI 應 fallback 不顯示 TWD。
 */
export function useUsdtTwdRate(): { rate: number | null; loading: boolean } {
  const [rate, setRate] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetchUsdtTwdRate();
        if (cancelled) return;
        setRate(Number(r.rate));
      } catch {
        // 靜默 — 保留上次值或 null
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled) return;
      timer = setTimeout(tick, 60_000);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { rate, loading };
}

export function fmtTwd(usdt: string | number, rate: number | null): string | null {
  if (rate === null) return null;
  const usdtNum = typeof usdt === "string" ? Number(usdt) : usdt;
  if (Number.isNaN(usdtNum)) return null;
  const twd = usdtNum * rate;
  return twd.toLocaleString("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  });
}
