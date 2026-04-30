import { apiFetch } from "@/lib/api";

export interface Wallet {
  address: string;
  network: "testnet" | "mainnet";
  coin: string;
  token: string;
}

export interface Balance {
  available: string;
  pending: string;
  currency: string;
}

export interface OnchainTx {
  id: number;
  tx_hash: string;
  amount: string;
  currency: string;
  status: "PROVISIONAL" | "POSTED" | "INVALID";
  confirmations: number;
  block_number: number | null;
  created_at: string;
  posted_at: string | null;
}

export async function fetchMyWallet(): Promise<Wallet> {
  return apiFetch<Wallet>("/api/wallet/me");
}

export async function fetchMyBalance(): Promise<Balance> {
  return apiFetch<Balance>("/api/wallet/balance");
}

export async function fetchMyHistory(limit = 20): Promise<OnchainTx[]> {
  return apiFetch<OnchainTx[]>(`/api/wallet/history?limit=${limit}`);
}

export async function devSimulateDeposit(userId: number, amount: string): Promise<OnchainTx> {
  return apiFetch<OnchainTx>("/api/admin/dev/simulate-deposit", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, amount }),
  });
}
