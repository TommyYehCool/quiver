"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

export function WhitelistCard() {
  const router = useRouter();
  const confirm = useConfirm();
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
      setErr("地址格式錯誤(必須是 Tron 地址,T 開頭 34 字元)");
      return;
    }
    if (!label.trim()) {
      setErr("請填上標籤");
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
      title: "移除這個白名單地址?",
      body: "你之後若還要提到這個地址,需重新加入並等冷靜期。",
      variant: "danger",
      confirmLabel: "移除",
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
      const c = prompt("請輸入 6 位驗證碼確認此操作:");
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
          <CardTitle>提領白名單地址</CardTitle>
          <CardDescription>
            預先綁定常用提領地址(冷靜期 {data?.cooldown_hours ?? 24} 小時後生效),
            開啟「只能提到白名單」更安全。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === null ? (
          <p className="text-sm text-slate-500">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> 載入中
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
                    白名單模式 已開啟 — 只能提到下方已啟用地址
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    白名單模式 已關閉 — 可提到任何地址(白名單僅作建議)
                  </>
                )}
              </span>
              <Button onClick={handleToggleMode} disabled={busy} variant="outline" size="sm">
                {data.only_mode ? "關閉" : "啟用"}
              </Button>
            </div>

            {/* 列表 */}
            {data.items.length === 0 ? (
              <p className="rounded-md border border-cream-edge bg-paper p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                還沒加任何地址。
              </p>
            ) : (
              <ul className="space-y-2">
                {data.items.map((it) => (
                  <WhitelistRow
                    key={it.id}
                    it={it}
                    cooldownHours={data.cooldown_hours}
                    onRemove={handleRemove}
                  />
                ))}
              </ul>
            )}

            {/* 新增 */}
            <div className="rounded-lg border border-cream-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-medium">新增地址</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="標籤(例:我的 Binance)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                  className="rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  placeholder="Tron 地址(T...)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value.trim())}
                  maxLength={34}
                  className="rounded-md border border-cream-edge bg-paper px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <Button onClick={handleAdd} disabled={busy} size="sm" className="mt-3">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                加入(冷靜期 {data.cooldown_hours} 小時)
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
  cooldownHours,
  onRemove,
}: {
  it: WhitelistEntry;
  cooldownHours: number;
  onRemove: (id: number) => void | Promise<void>;
}) {
  const remainingMs = new Date(it.activated_at).getTime() - Date.now();
  const inCooldown = !it.is_active && remainingMs > 0;
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
                已啟用
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <Clock className="h-3 w-3" />
                冷靜期 (還 {hoursLeft} 小時)
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
