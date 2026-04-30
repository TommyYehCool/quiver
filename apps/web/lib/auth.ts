/**
 * Server-side auth helper — 在 RSC / Server Component 內透過後端 API 拿 user。
 *
 * 注意：瀏覽器走 NEXT_PUBLIC_API_BASE_URL，伺服器 (container) 走內部 service name `api`。
 *
 * 用 React.cache 包起來:同一次 render 內被重複呼叫(例如 (app)/layout + (user)/layout +
 * page 都各自需要 user)會 dedupe 成單次 HTTP call。
 */

import { cache } from "react";

import type { User } from "@/lib/api";

const SERVER_API_BASE_URL =
  process.env.SERVER_API_BASE_URL ?? "http://api:8000";

export const fetchMeServer = cache(
  async (cookieHeader: string): Promise<User | null> => {
    if (!cookieHeader) return null;

    const res = await fetch(`${SERVER_API_BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    const wrapped = (await res.json()) as { success: boolean; data?: User };
    return wrapped.success && wrapped.data ? wrapped.data : null;
  },
);
