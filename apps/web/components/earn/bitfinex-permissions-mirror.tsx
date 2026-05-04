/**
 * Visual mirror of Bitfinex's "Create New API Key" permission panel.
 *
 * Renders a faux-toggle list that looks like Bitfinex's own permission UI
 * so users can match each row 1:1 instead of cross-referencing a text
 * checklist. Two highlights:
 *   - critical (emerald): the row our auto-lend strictly needs (Offer,
 *     cancel and close funding under Margin Funding)
 *   - danger   (red):     the row that must NEVER be enabled (Create a
 *     new withdrawal under Withdraw — the #1 attack vector)
 *
 * Server component (no state, no event handlers). Renders 3 locales' worth
 * of content from a single static map.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PermissionRow {
  name: string;
  on: boolean;
  /** Highlight as the row Quiver needs. */
  critical?: boolean;
  /** Highlight as a row that must NEVER be enabled. */
  danger?: boolean;
}

interface PermissionSection {
  label: string;
  items: PermissionRow[];
}

interface LocaleData {
  title: string;
  subtitle: string;
  legendOn: string;
  legendOff: string;
  criticalLabel: string;
  dangerLabel: string;
  ipLabel: string;
  ipHint: string;
  sections: PermissionSection[];
}

const DATA: Record<"zh-TW" | "en" | "ja", LocaleData> = {
  "zh-TW": {
    title: "對照 Bitfinex 權限頁面設定",
    subtitle:
      "Bitfinex「Create New Key」頁面的開關長這樣 — 跟著下面打開 / 關掉就對了。藍色 = 開,灰色 = 關。",
    legendOn: "= 開",
    legendOff: "= 關",
    criticalLabel: "← Quiver 自動放貸必要",
    dangerLabel: "← 絕對不要開,被偷錢的最大入口",
    ipLabel: "📌 IP 位址限制",
    ipHint: "強烈建議勾「Restrict access to specific IPs」並只填我們的 IP:",
    sections: [
      {
        label: "帳戶資訊",
        items: [
          { name: "查閱帳戶手續費", on: true },
          { name: "編輯帳戶訊息", on: false },
        ],
      },
      {
        label: "賬戶歷史",
        items: [{ name: "查閱歷史餘額及交易紀錄", on: true }],
      },
      {
        label: "訂單",
        items: [
          { name: "查閱訂單及訂單狀態", on: true },
          { name: "新增及取消訂單", on: false },
        ],
      },
      {
        label: "保證金交易",
        items: [
          { name: "查閱倉位及保證金交易", on: true },
          { name: "贖回倉位", on: false },
        ],
      },
      {
        label: "保證金融資",
        items: [
          { name: "查閱融資狀態及信息", on: true },
          { name: "提供、取消及關閉融資", on: true, critical: true },
        ],
      },
      {
        label: "錢包",
        items: [
          { name: "查閱錢包餘額及地址", on: true },
          { name: "於錢包間轉移資金", on: false },
        ],
      },
      {
        label: "提款",
        items: [{ name: "建立提款請求", on: false, danger: true }],
      },
      {
        label: "Settings",
        items: [
          { name: "Read account settings", on: true },
          { name: "Write account settings", on: false },
        ],
      },
    ],
  },
  en: {
    title: "Mirror this when creating your Bitfinex API key",
    subtitle:
      "Bitfinex's «Create New Key» page looks like this — just match each toggle below. Blue = on, grey = off.",
    legendOn: "= On",
    legendOff: "= Off",
    criticalLabel: "← Required for Quiver auto-lend",
    dangerLabel: "← Never enable — the #1 way funds get stolen",
    ipLabel: "📌 IP allowlist",
    ipHint:
      "Strongly recommended: tick «Restrict access to specific IPs» and only allow our IP:",
    sections: [
      {
        label: "Account Info",
        items: [
          { name: "Get account fees", on: true },
          { name: "Edit account info", on: false },
        ],
      },
      {
        label: "Account History",
        items: [{ name: "Get historical balances and trades", on: true }],
      },
      {
        label: "Orders",
        items: [
          { name: "Get orders and order status", on: true },
          { name: "Create and cancel orders", on: false },
        ],
      },
      {
        label: "Margin Trading",
        items: [
          { name: "Get positions and margin info", on: true },
          { name: "Claim a position", on: false },
        ],
      },
      {
        label: "Margin Funding",
        items: [
          { name: "Get funding statuses and info", on: true },
          { name: "Offer, cancel and close funding", on: true, critical: true },
        ],
      },
      {
        label: "Wallets",
        items: [
          { name: "Get wallet balances and addresses", on: true },
          { name: "Transfer between your wallets", on: false },
        ],
      },
      {
        label: "Withdraw",
        items: [{ name: "Create a new withdrawal", on: false, danger: true }],
      },
      {
        label: "Settings",
        items: [
          { name: "Read account settings", on: true },
          { name: "Write account settings", on: false },
        ],
      },
    ],
  },
  ja: {
    title: "Bitfinex API キー作成時はこの通りに",
    subtitle:
      "Bitfinex の「Create New Key」ページの権限はこの形 — 下のトグルに合わせて オン/オフ してください。青 = オン、グレー = オフ。",
    legendOn: "= オン",
    legendOff: "= オフ",
    criticalLabel: "← Quiver 自動貸付に必須",
    dangerLabel: "← 絶対オンにしない — 資金窃取の最大入口",
    ipLabel: "📌 IP アドレス制限",
    ipHint:
      "「Restrict access to specific IPs」を有効にして、Quiver の IP のみ許可することを強く推奨:",
    sections: [
      {
        label: "アカウント情報",
        items: [
          { name: "アカウント手数料の閲覧", on: true },
          { name: "アカウント情報の編集", on: false },
        ],
      },
      {
        label: "アカウント履歴",
        items: [{ name: "履歴残高と取引履歴の閲覧", on: true }],
      },
      {
        label: "注文",
        items: [
          { name: "注文と注文ステータスの閲覧", on: true },
          { name: "注文の作成とキャンセル", on: false },
        ],
      },
      {
        label: "マージン取引",
        items: [
          { name: "ポジションとマージン情報の閲覧", on: true },
          { name: "ポジションの請求", on: false },
        ],
      },
      {
        label: "マージンファンディング",
        items: [
          { name: "ファンディング状況と情報の閲覧", on: true },
          {
            name: "ファンディングのオファー、キャンセル、クローズ",
            on: true,
            critical: true,
          },
        ],
      },
      {
        label: "ウォレット",
        items: [
          { name: "ウォレット残高とアドレスの閲覧", on: true },
          { name: "ウォレット間の資金移動", on: false },
        ],
      },
      {
        label: "出金",
        items: [
          { name: "出金リクエストの作成", on: false, danger: true },
        ],
      },
      {
        label: "Settings",
        items: [
          { name: "Read account settings", on: true },
          { name: "Write account settings", on: false },
        ],
      },
    ],
  },
};

function pickLocale(l: string): "zh-TW" | "en" | "ja" {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export function BitfinexPermissionsMirror({ locale }: { locale: string }) {
  const data = DATA[pickLocale(locale)];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{data.title}</CardTitle>
        <CardDescription>{data.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Legend — quick reminder which colour is which */}
        <div className="flex items-center gap-3 border-b border-cream-edge pb-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <FauxToggle on={true} mini />
            {data.legendOn}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FauxToggle on={false} mini />
            {data.legendOff}
          </span>
        </div>

        {data.sections.map((section, i) => (
          <div key={i}>
            <div className="mb-1 px-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
              {section.label}
            </div>
            <ul className="space-y-1">
              {section.items.map((item, j) => (
                <PermissionItem key={j} item={item} data={data} />
              ))}
            </ul>
          </div>
        ))}

        {/* IP allowlist mirrors Bitfinex's bottom-of-page section */}
        <div className="mt-3 border-t border-cream-edge pt-3 dark:border-slate-800">
          <div className="mb-1 text-xs font-semibold text-sky-700 dark:text-sky-400">
            {data.ipLabel}
          </div>
          <p className="mb-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {data.ipHint}
          </p>
          <code className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-xs dark:bg-slate-800">
            45.77.30.174
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionItem({
  item,
  data,
}: {
  item: PermissionRow;
  data: LocaleData;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
        item.critical &&
          "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900",
        item.danger &&
          "bg-red-50 ring-1 ring-red-200 dark:bg-red-950/30 dark:ring-red-900",
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-xs leading-snug",
            item.critical &&
              "font-semibold text-emerald-800 dark:text-emerald-300",
            item.danger && "font-semibold text-red-800 dark:text-red-300",
            !item.critical && !item.danger && "text-slate-700 dark:text-slate-300",
          )}
        >
          {item.name}
        </div>
        {item.critical ? (
          <div className="mt-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            {data.criticalLabel}
          </div>
        ) : null}
        {item.danger ? (
          <div className="mt-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
            {data.dangerLabel}
          </div>
        ) : null}
      </div>
      <FauxToggle on={item.on} />
    </li>
  );
}

/**
 * Pure-CSS faux toggle that visually mimics Bitfinex's permission switch.
 * Not interactive — purely decorative so users can match each row.
 */
function FauxToggle({ on, mini }: { on: boolean; mini?: boolean }) {
  const w = mini ? "w-6" : "w-8";
  const h = mini ? "h-3.5" : "h-4";
  const dot = mini ? "h-2.5 w-2.5" : "h-3 w-3";
  const offsetOn = mini ? "translate-x-3" : "translate-x-4";
  const offsetOff = "translate-x-0.5";
  return (
    <div
      className={cn(
        "relative flex-none rounded-full transition-colors",
        w,
        h,
        on ? "bg-blue-500" : "bg-slate-400 dark:bg-slate-600",
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute top-0.5 inline-block rounded-full bg-white shadow transition-transform",
          dot,
          on ? offsetOn : offsetOff,
        )}
      />
    </div>
  );
}
