import { DeletionRequestsList } from "@/components/admin/deletion-requests-list";

export default function AdminDeletionRequestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">帳號刪除申請</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          用戶申請刪除帳號(個資法第 11 條 / GDPR right to erasure)。確認餘額 = 0 後,點「完成刪除」進行 soft delete。
          ledger 紀錄保留(法遵)。
        </p>
      </div>
      <DeletionRequestsList />
    </div>
  );
}
