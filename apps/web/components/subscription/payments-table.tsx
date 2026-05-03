import type { PaymentOut } from "@/lib/api/subscription";

interface PaymentsTableStrings {
  empty: string;
  date: string;
  period: string;
  amount: string;
  status: string;
  paid: string;
  failed: string;
  failureInsufficient: string;
}

export function PaymentsTable({
  items,
  strings,
}: {
  items: PaymentOut[];
  strings: PaymentsTableStrings;
}) {
  if (items.length === 0) {
    return <p className="text-sm italic text-slate-500">{strings.empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-edge text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
            <th className="py-2 pr-4">{strings.date}</th>
            <th className="py-2 pr-4">{strings.period}</th>
            <th className="py-2 pr-4">{strings.status}</th>
            <th className="py-2 pr-4 text-right">{strings.amount}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const periodStart = new Date(p.period_covered_start)
              .toLocaleDateString();
            const periodEnd = new Date(p.period_covered_end)
              .toLocaleDateString();
            const failureLabel =
              p.failure_reason === "insufficient_balance"
                ? strings.failureInsufficient
                : (p.failure_reason ?? "");
            return (
              <tr
                key={p.id}
                className="border-b border-cream-edge/60 dark:border-slate-800"
              >
                <td className="py-2 pr-4 text-xs text-slate-500">
                  {new Date(p.billed_at).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-xs text-slate-500">
                  {periodStart} – {periodEnd}
                </td>
                <td className="py-2 pr-4 text-xs">
                  {p.status === "PAID" ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                      {strings.paid}
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300">
                      {strings.failed}
                      {failureLabel ? ` · ${failureLabel}` : ""}
                    </span>
                  )}
                </td>
                <td
                  className={
                    p.status === "PAID"
                      ? "py-2 pr-4 text-right font-mono tabular-nums"
                      : "py-2 pr-4 text-right font-mono tabular-nums text-slate-400 line-through"
                  }
                >
                  {Number(p.amount_usdt).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
