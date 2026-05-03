import type { PayoutOut } from "@/lib/api/referral";

interface PayoutsTableStrings {
  empty: string;
  date: string;
  level: string;
  amount: string;
  l1: string;
  l2: string;
}

export function PayoutsTable({
  items,
  strings,
}: {
  items: PayoutOut[];
  strings: PayoutsTableStrings;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm italic text-slate-500">{strings.empty}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-edge text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
            <th className="py-2 pr-4">{strings.date}</th>
            <th className="py-2 pr-4">{strings.level}</th>
            <th className="py-2 pr-4 text-right">{strings.amount}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr
              key={p.id}
              className="border-b border-cream-edge/60 dark:border-slate-800"
            >
              <td className="py-2 pr-4 text-xs text-slate-500">
                {new Date(p.paid_at).toLocaleString("zh-TW")}
              </td>
              <td className="py-2 pr-4 text-xs">
                <span
                  className={
                    p.level === 1
                      ? "rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300"
                      : "rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300"
                  }
                >
                  {p.level === 1 ? strings.l1 : strings.l2}
                </span>
              </td>
              <td className="py-2 pr-4 text-right font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                +{Number(p.amount).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
