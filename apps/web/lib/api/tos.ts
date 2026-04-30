/**
 * TOS / Privacy acceptance client (phase 6E-5).
 */

import { apiFetch } from "@/lib/api";

export interface TosStatus {
  accepted_at: string | null;
  accepted_version: string | null;
  current_version: string;
  needs_acceptance: boolean;
}

export async function fetchTosStatus(): Promise<TosStatus> {
  return apiFetch<TosStatus>("/api/me/tos");
}

export async function acceptTos(version: string): Promise<TosStatus> {
  return apiFetch<TosStatus>("/api/me/tos", {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}
