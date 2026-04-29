/**
 * System setup (KEK bootstrap) API client。
 */

import { apiFetch } from "@/lib/api";

export interface SetupStatus {
  initialized: boolean;
  awaiting_verify: boolean;
  kek_present_in_env: boolean;
  kek_matches_db: boolean | null;
}

export interface KekGenerateResp {
  kek_b64: string;
  kek_hash_preview: string;
}

export interface KekVerifyResp {
  initialized: boolean;
  next_step: string;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiFetch<SetupStatus>("/api/admin/setup/status");
}

export async function generateKek(): Promise<KekGenerateResp> {
  return apiFetch<KekGenerateResp>("/api/admin/setup/generate-kek", { method: "POST" });
}

export async function verifyKek(kek_b64: string): Promise<KekVerifyResp> {
  return apiFetch<KekVerifyResp>("/api/admin/setup/verify-kek", {
    method: "POST",
    body: JSON.stringify({ kek_b64 }),
  });
}
