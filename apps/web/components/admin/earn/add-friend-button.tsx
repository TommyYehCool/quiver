"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEarnAccount,
  fetchEligibleUsers,
  type FriendUserOption,
} from "@/lib/api/earn";

/**
 * 新增 friend earn 帳戶 modal:
 * - 從下拉選 user(僅列 earn_tier='none')
 * - 輸入 Bitfinex API key + secret(read-only 權限)
 * - (可選)Polygon EVM 地址
 * - notes
 */
export function AddFriendButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [users, setUsers] = React.useState<FriendUserOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // form
  const [userId, setUserId] = React.useState<number | null>(null);
  const [earnTier, setEarnTier] = React.useState<"friend" | "internal">(
    "friend",
  );
  const [perfFeeBps, setPerfFeeBps] = React.useState(0);
  const [bitfinexKey, setBitfinexKey] = React.useState("");
  const [bitfinexSecret, setBitfinexSecret] = React.useState("");
  const [evmAddress, setEvmAddress] = React.useState("");
  const [evmLabel, setEvmLabel] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function openModal() {
    setOpen(true);
    setErr(null);
    setDone(false);
    setLoading(true);
    try {
      const list = await fetchEligibleUsers();
      setUsers(list);
      if (list.length > 0) setUserId(list[0].id);
    } catch (e) {
      setErr((e as { code?: string }).code ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setUserId(null);
    setEarnTier("friend");
    setPerfFeeBps(0);
    setBitfinexKey("");
    setBitfinexSecret("");
    setEvmAddress("");
    setEvmLabel("");
    setNotes("");
    setErr(null);
    setDone(false);
  }

  async function submit() {
    if (!userId) {
      setErr("請選擇 user");
      return;
    }
    if (bitfinexKey.length < 20 || bitfinexSecret.length < 20) {
      setErr("Bitfinex key 跟 secret 都要滿 20 字元");
      return;
    }
    if (evmAddress && !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
      setErr("Polygon 地址格式錯誤(應為 0x + 40 hex)");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createEarnAccount({
        user_id: userId,
        earn_tier: earnTier,
        custody_mode: "self",
        perf_fee_bps: perfFeeBps,
        can_quiver_operate: false,
        bitfinex_api_key: bitfinexKey.trim(),
        bitfinex_api_secret: bitfinexSecret.trim(),
        bitfinex_permissions: "read",
        evm_polygon_address: evmAddress.trim() || null,
        evm_label: evmLabel.trim() || null,
        notes: notes.trim() || null,
      });
      setDone(true);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "error";
      const params = (e as { params?: { max?: number; current?: number } }).params;
      if (code === "earn.alreadyExists") {
        setErr("此 user 已經是 earn 帳戶,不能重複加");
      } else if (code === "earn.tooManyFriends" && params) {
        setErr(`已達朋友人數上限 ${params.max}(目前 ${params.current})`);
      } else if (code === "earn.encryptFailed") {
        setErr("加密失敗,KEK 設定可能有問題");
      } else if (code === "user.notFound") {
        setErr("User 不存在");
      } else {
        setErr(code);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={openModal} size="sm">
        <UserPlus className="h-4 w-4" />
        加朋友
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-cream-edge bg-paper p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">新增 Earn 帳戶</h2>
            <p className="mt-1 text-xs text-slate-500">
              朋友自己保管資金、自己的 Bitfinex 帳戶。Quiver 只是 read-only 監控工具。
            </p>

            {done ? (
              <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> 新增成功
                </p>
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                  接著可以從列表進入詳情、手動「同步」一次驗證 API key 是否能讀。
                </p>
                <Button onClick={close} className="mt-3 w-full">
                  關閉
                </Button>
              </div>
            ) : loading ? (
              <p className="mt-4 text-sm text-slate-500">
                <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> 載入候選用戶
              </p>
            ) : users.length === 0 ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  目前沒有可加入的 user(所有既有 user 都已參加 earn 或還沒註冊)。
                  朋友請先用 Google OAuth 登入 Quiver wallet,再來加 earn。
                </p>
                <Button onClick={close} variant="outline" className="mt-3">
                  知道了
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  <div>
                    <Label>選擇 User</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      value={userId ?? ""}
                      onChange={(e) => setUserId(Number(e.target.value))}
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                          {u.display_name ? ` (${u.display_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>角色</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      value={earnTier}
                      onChange={(e) =>
                        setEarnTier(e.target.value as "friend" | "internal")
                      }
                    >
                      <option value="friend">friend(朋友)</option>
                      <option value="internal">internal(自己 / admin)</option>
                    </select>
                  </div>

                  <div>
                    <Label>Perf fee (bps)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={5000}
                      value={perfFeeBps}
                      onChange={(e) => setPerfFeeBps(Number(e.target.value))}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      0 = 不抽成(預設)。500 = 5%、1500 = 15%。
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="bx-key">Bitfinex API Key</Label>
                    <Input
                      id="bx-key"
                      type="password"
                      value={bitfinexKey}
                      onChange={(e) => setBitfinexKey(e.target.value)}
                      placeholder="t-... (長 ~43 字元)"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <Label htmlFor="bx-secret">Bitfinex API Secret</Label>
                    <Input
                      id="bx-secret"
                      type="password"
                      value={bitfinexSecret}
                      onChange={(e) => setBitfinexSecret(e.target.value)}
                      placeholder="(長 ~43 字元)"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      key 跟 secret 用 AES-GCM + KEK 加密儲存,只有 read 權限應該夠。
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="evm-addr">Polygon 地址 (可選)</Label>
                    <Input
                      id="evm-addr"
                      value={evmAddress}
                      onChange={(e) => setEvmAddress(e.target.value)}
                      placeholder="0x..."
                      className="font-mono text-xs"
                    />
                  </div>

                  {evmAddress ? (
                    <div>
                      <Label htmlFor="evm-label">EVM 地址 label (可選)</Label>
                      <Input
                        id="evm-label"
                        value={evmLabel}
                        onChange={(e) => setEvmLabel(e.target.value)}
                        placeholder="例:Alice MetaMask"
                      />
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor="notes">Notes (可選)</Label>
                    <textarea
                      id="notes"
                      className="mt-1 w-full rounded-md border border-cream-edge bg-paper px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                {err ? (
                  <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {err}
                  </p>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <Button onClick={close} variant="outline" disabled={busy}>
                    取消
                  </Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加密中
                      </>
                    ) : (
                      "新增"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
