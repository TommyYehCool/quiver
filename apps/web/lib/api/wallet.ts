import { apiFetch } from "@/lib/api";

export interface Wallet {
  address: string;
  network: "testnet" | "mainnet";
  coin: string;
  token: string;
}

export interface Balance {
  available: string;  // ledger 可動用
  onchain: string;    // 鏈上 derive 地址實際餘額(參考用)
  pending: string;    // 還在確認中的入金
  currency: string;
}

export type ActivityType =
  | "DEPOSIT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "WITHDRAWAL"
  | "REFUND";

export interface ActivityItem {
  id: string;  // "d:{onchain_id}" 或 "t:{ledger_id}"
  type: ActivityType;
  amount: string;
  currency: string;
  status: string;
  note: string | null;
  counterparty_email: string | null;
  counterparty_display_name: string | null;
  tx_hash: string | null;
  created_at: string;
}

export interface ActivityListResponse {
  items: ActivityItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchMyWallet(): Promise<Wallet> {
  return apiFetch<Wallet>("/api/wallet/me");
}

export async function fetchMyBalance(): Promise<Balance> {
  return apiFetch<Balance>("/api/wallet/balance");
}

export async function fetchMyHistory(opts: {
  type?: "all" | "DEPOSIT" | "TRANSFER";
  page?: number;
  pageSize?: number;
} = {}): Promise<ActivityListResponse> {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch<ActivityListResponse>(`/api/wallet/history${qs ? `?${qs}` : ""}`);
}

export interface TatumSyncResult {
  callback_url: string | null;
  created: number;
  refreshed: number;
  skipped: number;
  failed: number;
}

export async function syncTatumSubscriptions(): Promise<TatumSyncResult> {
  return apiFetch<TatumSyncResult>("/api/admin/dev/sync-tatum", { method: "POST" });
}
