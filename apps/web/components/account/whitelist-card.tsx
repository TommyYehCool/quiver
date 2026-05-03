"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Bookmark, Clock, Loader2, Lock, Plus, Trash2, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  addWhitelist,
  fetchWhitelist,
  removeWhitelist,
  toggleWhitelistMode,
  type WhitelistEntry,
  type WhitelistList,
} from "@/lib/api/whitelist";
import { fetchTwoFAStatus } from "@/lib/api/twofa";

const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

type Locale = "zh-TW" | "en" | "ja";
const STRINGS: Record<Locale, {
  invalidAddress: string;
  labelRequired: string;
  removeConfirmTitle: string;
  removeConfirmBody: string;
  removeConfirmLabel: string;
  twofaPrompt: string;
  title: string;
  desc: (h: number) => string;
  loading: string;
  modeOn: string;
  modeOff: string;
  modeToggleOn: string;
  modeToggleOff: string;
  emptyList: string;
  addTitle: string;
  labelPlaceholder: string;
  addrPlaceholder: string;
  addCta: (h: number) => string;
  active: string;
  cooldown: (h: number) => string;
}> = {
  "zh-TW": {
    invalidAddress: "地址格式錯誤(必須是 Tron 地址,T 開頭 34 字元)",
    labelRequired: "請填上標籤",
    removeConfirmTitle: "移除這個白名單地址?",
    removeConfirmBody: "你之後若還要提到這個地址,需重新加入並等冷靜期。",
    removeConfirmLabel: "移除",
    twofaPrompt: "請輸入 6 位驗證碼確認此操作:",
    title: "提領白名單地址",
    desc: (h) => `預先綁定常用提領地址(冷靜期 ${h} 小時後生效),開啟「只能提到白名單」更安全。`,
    loading: "載入中",
    modeOn: "白名單模式 已開啟 — 只能提到下方已啟用地址",
    modeOff: "白名單模式 已關閉 — 可提到任何地址(白名單僅作建議)",
    modeToggleOn: "啟用",
    modeToggleOff: "關閉",
    emptyList: "還沒加任何地址。",
    addTitle: "新增地址",
    labelPlaceholder: "標籤(例:我的 Binance)",
    addrPlaceholder: "Tron 地址(T...)",
    addCta: (h) => `加入(冷靜期 ${h} 小時)`,
    active: "已啟用",
    cooldown: (h) => `冷靜期 (還 ${h} 小時)`,
  },
  en: {
    invalidAddress: "Invalid address format (must be a Tron address — 34 chars starting with T)",
    labelRequired: "Please enter a label",
    removeConfirmTitle: "Remove this whitelisted address?",
    removeConfirmBody: "If you want to withdraw to this address later, you'll need to add it back and wait through the cooldown again.",
    removeConfirmLabel: "Remove",
    twofaPrompt: "Enter your 6-digit code to confirm:",
    title: "Withdrawal whitelist",
    desc: (h) => `Pre-bind addresses you frequently withdraw to (active after ${h}h cooldown). Enabling "whitelist only" mode adds extra safety.`,
    loading: "Loading",
    modeOn: "Whitelist mode ON — withdrawals only to active addresses below",
    modeOff: "Whitelist mode OFF — withdrawals to any address (whitelist is suggestion only)",
    modeToggleOn: "Enable",
    modeToggleOff: "Disable",
    emptyList: "No addresses added yet.",
    addTitle: "Add address",
    labelPlaceholder: "Label (e.g. My Binance)",
    addrPlaceholder: "Tron address (T...)",
    addCta: (h) => `Add (${h}h cooldown)`,
    active: "Active",
    cooldown: (h) => `Cooldown (${h}h left)`,
  },
  ja: {
    invalidAddress: "アドレス形式が無効(Tron アドレス必須 — T で始まる 34 文字)",
    labelRequired: "ラベルを入力してください",
    removeConfirmTitle: "このホワイトリストアドレスを削除しますか?",
    removeConfirmBody: "再度このアドレスに出金したい場合、追加し直してクールダウンを待つ必要があります。",
    removeConfirmLabel: "削除",
    twofaPrompt: "6 桁の認証コードを入力して確認:",
    title: "出金ホワイトリスト",
    desc: (h) => `頻繁に使う出金先を事前登録(${h} 時間のクールダウン後に有効)。「ホワイトリストのみ」モードでさらに安全に。`,
    loading: "読み込み中",
    modeOn: "ホワイトリストモード ON — 下記の有効なアドレスのみ出金可能",
    modeOff: "ホワイトリストモード OFF — 任意のアドレスに出金可能(ホワイトリストは提案のみ)",
    modeToggleOn: "有効化",
    modeToggleOff: "無効化",
    emptyList: "アドレスがまだ追加されていません。",
    addTitle: "アドレスを追加",
    labelPlaceholder: "ラベル(例:私の Binance)",
    addrPlaceholder: "Tron アドレス(T...)",
    addCta: (h) => `追加(${h} 時間のクールダウン)`,
    active: "有効",
    cooldown: (h) => `クールダウン(残り ${h} 時間)`,
  },
};
function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export function WhitelistCard() {
  const router = useRouter();
  const confirm = useConfirm();
  const s = STRINGS[pickLocale(useLocale())];
  const [data, setData] = React.useState<WhitelistList | null>(null);
  const [twofaEnabled, setTwofaEnabled] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const [w, t] = await Promise.all([fetchWhitelist(), fetchTwoFAStatus()]);
      setData(w);
      setTwofaEnabled(t.enabled);
    } catch {
      setData(null);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAdd() {
    if (!TRON_RE.test(address)) {
      setErr(s.invalidAddress);
      return;
    }
    if (!label.trim()) {
      setErr(s.labelRequired);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await addWhitelist(address, label);
      setAddress("");
      setLabel("");
      await reload();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: number) {
    const ok = await confirm({
      title: s.removeConfirmTitle,
      body: s.removeConfirmBody,
      variant: "danger",
      confirmLabel: s.removeConfirmLabel,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeWhitelist(id);
      await reload();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleMode() {
    if (!data) return;
    const next = !data.only_mode;
    let code: string | undefined;
    if (twofaEnabled) {
      const c = prompt(s.twofaPrompt);
      if (!c) return;
      code = c;
    }
    setBusy(true);
    setErr(null);
    try {
      await toggleWhitelistMode(next, code);
      await reload();
      router.refresh();
    } catch (e) {
      setErr((e as { code?: string }).code ?? "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-macaron-peach dark:bg-slate-900">
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bubble-peach">
          <Bookmark className="h-6 w-6 text-amber-700" />
        </span>
        <div className="flex-1">
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.desc(data?.cooldown_hours ?? 24)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === null ? (
          <p className="text-sm text-slate-500">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> {s.loading}
          </p>
        ) : (
          <>
            {/* 模式切換 */}
            <div
              className={
                data.only_mode
                  ? "flex items-center justify-between rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }
            >
              <span className="flex items-center gap-2">
                {data.only_mode ? (
                  <>
                    <Lock className="h-4 w-4" />
                    {s.modeOn}
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    {s.modeOff}
                  </>
                )}
              </span>
              <Button onClick={handleToggleMode} disabled={busy} variant="outline" size="sm">
                {data.only_mode ? s.modeToggleOff : s.modeToggleOn}
              </Button>
            </div>

            {/* 列表 */}
            {data.items.length === 0 ? (
              <p className="rounded-md border border-cream-edge bg-paper p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                {s.emptyList}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.items.map((it) => (
                  <WhitelistRow
                    key={it.id}
                    it={it}
                    activeLabel={s.active}
                    cooldownLabel={s.cooldown}
                    onRemove={handleRemove}
                  />
                ))}
              </ul>
            )}

            {/* 新增 */}
            <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-medium">{s.addTitle}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder={s.labelPlaceholder}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                  className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  placeholder={s.addrPlaceholder}
                  value={address}
                  onChange={(e) => setAddress(e.target.value.trim())}
                  maxLength={34}
                  className="rounded-md border border-cream-edge bg-paper px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <Button onClick={handleAdd} disabled={busy} size="sm" className="mt-3">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {s.addCta(data.cooldown_hours)}
              </Button>
            </div>
          </>
        )}

        {err ? (
          <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {err}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WhitelistRow({
  it,
  activeLabel,
  cooldownLabel,
  onRemove,
}: {
  it: WhitelistEntry;
  activeLabel: string;
  cooldownLabel: (h: number) => string;
  onRemove: (id: number) => void | Promise<void>;
}) {
  const remainingMs = new Date(it.activated_at).getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.ceil(remainingMs / 3_600_000));
  return (
    <li
      className={
        it.is_active
          ? "rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800"
          : "rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm">
            <strong className="truncate">{it.label}</strong>
            {it.is_active ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {activeLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <Clock className="h-3 w-3" />
                {cooldownLabel(hoursLeft)}
              </span>
            )}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{it.address}</p>
        </div>
        <Button onClick={() => onRemove(it.id)} variant="outline" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
