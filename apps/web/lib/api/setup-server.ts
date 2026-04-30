/**
 * Server-side setup status fetcher (RSC).
 * cached 避免 (admin)/layout、dashboard、admin overview 等重複打。
 */

import { cache } from "react";

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

export interface SetupStatusResp {
  initialized: boolean;
  awaiting_verify: boolean;
}

export const fetchSetupStatusServer = cache(
  async (cookieHeader: string): Promise<SetupStatusResp | null> => {
    const res = await fetch(`${SERVER_API_BASE_URL}/api/admin/setup/status`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const wrapped = (await res.json()) as { success: boolean; data?: SetupStatusResp };
    return wrapped.success ? wrapped.data ?? null : null;
  },
);
