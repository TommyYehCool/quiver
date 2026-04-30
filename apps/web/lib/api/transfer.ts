import { apiFetch } from "@/lib/api";

export interface RecipientPreview {
  email: string;
  display_name: string | null;
  kyc_approved: boolean;
  is_self: boolean;
}

export async function lookupRecipient(email: string): Promise<RecipientPreview | null> {
  const params = new URLSearchParams({ email });
  return apiFetch<RecipientPreview | null>(`/api/transfers/recipient?${params.toString()}`);
}

export interface TransferResult {
  ledger_tx_id: number;
  sender_balance_after: string;
  recipient_email: string;
}

export async function submitTransfer(input: {
  recipient_email: string;
  amount: string;
  note?: string | null;
  totp_code?: string | null;
}): Promise<TransferResult> {
  return apiFetch<TransferResult>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
