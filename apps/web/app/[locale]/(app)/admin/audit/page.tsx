import { AuditList } from "@/components/admin/audit-list";

export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          系統值得追究的動作流水 — KYC 審核、提領審核、bulk-sweep、刪除帳號、登入成功等。
          append-only,不會 update / delete。
        </p>
      </div>
      <AuditList />
    </div>
  );
}
