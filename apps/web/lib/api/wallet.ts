import { apiFetch } from "@/lib/api";

export interface Wallet {
  address: string;
  network: "testnet" | "mainnet";
  coin: string;
  token: string;
}

export async function fetchMyWallet(): Promise<Wallet> {
  return apiFetch<Wallet>("/api/wallet/me");
}
