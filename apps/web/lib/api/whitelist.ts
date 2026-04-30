/**
 * Withdrawal whitelist client (phase 6E-2).
 */

import { apiFetch } from "@/lib/api";

export interface WhitelistEntry {
  id: number;
  address: string;
  label: string;
  activated_at: string;
  is_active: boolean;
  created_at: string;
}

export interface WhitelistList {
  items: WhitelistEntry[];
  only_mode: boolean;
  cooldown_hours: number;
}

export async function fetchWhitelist(): Promise<WhitelistList> {
  return apiFetch<WhitelistList>("/api/me/withdrawal-whitelist");
}

export async function addWhitelist(address: string, label: string): Promise<WhitelistEntry> {
  return apiFetch<WhitelistEntry>("/api/me/withdrawal-whitelist", {
    method: "POST",
    body: JSON.stringify({ address, label }),
  });
}

export async function removeWhitelist(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/me/withdrawal-whitelist/${id}`, {
    method: "DELETE",
  });
}

export async function toggleWhitelistMode(
  onlyMode: boolean,
  code?: string,
): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/me/withdrawal-whitelist/mode", {
    method: "POST",
    body: JSON.stringify({ only_mode: onlyMode, code: code ?? null }),
  });
}
