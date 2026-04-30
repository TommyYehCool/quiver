/**
 * 2FA TOTP client (phase 6E-2).
 */

import { apiFetch } from "@/lib/api";

export interface TwoFAStatus {
  enabled: boolean;
  enabled_at: string | null;
  backup_codes_remaining: number;
}

export interface TwoFASetup {
  secret: string;
  provisioning_uri: string;
}

export async function fetchTwoFAStatus(): Promise<TwoFAStatus> {
  return apiFetch<TwoFAStatus>("/api/me/2fa");
}

export async function startTwoFASetup(): Promise<TwoFASetup> {
  return apiFetch<TwoFASetup>("/api/me/2fa/setup", { method: "POST" });
}

export async function enableTwoFA(code: string): Promise<{ backup_codes: string[] }> {
  return apiFetch<{ backup_codes: string[] }>("/api/me/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function disableTwoFA(code: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/me/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
