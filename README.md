# Quiver

> 為新手打造的 USDT 託管錢包平台。內部互轉免手續費、提領由平台代付鏈上 gas、永遠以新台幣為主要顯示單位。

**狀態**：Phase 1（骨架 + Auth）完成。詳見 [ROADMAP](#roadmap)。

---

## Repo 結構

```
quiver/
├── apps/
│   ├── api/         # FastAPI (Python 3.12 + uv)
│   ├── web/         # Next.js 14 (TypeScript + pnpm/npm)
│   └── mobile/      # Flutter (Phase 7)
├── infra/
│   └── i18n/        # 共用文案（Phase 4+）
├── docs/
│   └── adr/         # 架構決策紀錄
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

---

## 第一次啟動指引（Phase 1）

### 1. 安裝必要工具

| 工具 | 版本 | 用途 |
|---|---|---|
| Docker Desktop | 4.x+ | 跑所有 service |
| Make | — | 簡化指令 |
| Git | 2.x+ | — |

> 不需要本機裝 Python / Node — 全部在容器內跑。

### 2. 申請 Google OAuth Credentials

1. 開 https://console.cloud.google.com/apis/credentials
2. 沒專案先建一個（隨便取名，例：`quiver-dev`）
3. 左側 **OAuth consent screen** → User Type 選 **External** → 填 app name `Quiver`、support email、developer email → Save
4. 在 **Test users** 加入你自己的 Gmail（外部 app 在 testing 階段只有列表內的人能登入）
5. 左側 **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
6. Application type 選 **Web application**
7. Authorized redirect URIs 加：
   ```
   http://localhost:8000/api/auth/google/callback
   ```
8. 建好後拿到 **Client ID** 和 **Client secret**

### 3. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，至少填這幾項：

```dotenv
GOOGLE_CLIENT_ID=<剛才拿到的>
GOOGLE_CLIENT_SECRET=<剛才拿到的>
JWT_SECRET=<跑下面這行產一個>
ADMIN_EMAILS=<你自己的 gmail>
```

產 JWT secret：

```bash
openssl rand -hex 64
```

### 4. 啟動

```bash
make up         # 啟動所有 container
make migrate    # 跑 alembic upgrade head
```

第一次 `make up` 會 build image，約 2–3 分鐘。

### 5. 驗證

| 操作 | 預期結果 |
|---|---|
| 開 http://localhost:3000 | 看到繁中 landing page |
| 點右上角語言切換 → English | URL 變 `/en`，文案變英文 |
| 點 **登入** → **使用 Google 繼續** | 跳到 Google consent → 同意後回到 `/zh-TW/dashboard` |
| Dashboard 看到「嗨，{你的名字}」 | ✅ |
| 信箱在 `ADMIN_EMAILS` 內 | 看到 `ADMIN` 徽章 |
| `curl http://localhost:8000/healthz` | `{"status":"ok"}` |

帶 cookie 拿自己的資訊（瀏覽器 devtools 拿 `quiver_session` 值）：

```bash
curl -H "Cookie: quiver_session=<你的 cookie>" http://localhost:8000/api/auth/me
```

預期：

```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "you@gmail.com",
    "display_name": "Your Name",
    "roles": ["USER", "ADMIN"],
    "status": "ACTIVE",
    "locale": "zh-TW"
  }
}
```

---

## 常用指令

```bash
make up            # 啟動全部
make down          # 停止
make logs          # 跟 api log
make logs-web      # 跟 web log
make logs-all      # 跟全部 log
make migrate       # 套 migration
make migration m="add foo"   # 產新 migration
make psql          # 進 postgres CLI
make reset-db      # 砍 DB 重來（含 volume）
make test          # 跑後端 pytest
make ngrok-url     # 印出 ngrok 對外 URL（webhook 用，Phase 3+）
```

---

## 可能踩雷

| 症狀 | 原因 / 解法 |
|---|---|
| `make up` 後 web 一直 restart | 第一次跑 npm install 慢，跑 `make logs-web` 看進度 |
| Google 登入跳「This app isn't verified」 | 正常，testing 階段必經。把自己加到 OAuth consent screen 的 Test users |
| 登入後看到 `/zh-TW/login?auth_error=oauth_failed` | redirect URI 沒對齊。Google Console 的必須**完全等於** `http://localhost:8000/api/auth/google/callback` |
| `/api/auth/me` 401 | cookie 沒帶上。前端用 `credentials: "include"`、curl 用 `-b`。也可能是 `JWT_SECRET` 沒填或重啟過導致舊 token 失效 |
| Admin 徽章沒出現 | `.env` 的 `ADMIN_EMAILS` 沒寫或寫錯，重啟 `api` container |
| Dashboard SSR 拿不到 user | Next.js 容器內用 `http://api:8000`，不能用 `localhost`。檢查 `SERVER_API_BASE_URL` |
| Postgres 起不來 | volume 衝突，`make reset-db` 或 `docker compose down -v` |

---

## ROADMAP

| Phase | 範圍 | 狀態 |
|---|---|---|
| 0 | 釐清問題 | ✅ |
| **1** | **Monorepo 骨架 + Auth + i18n** | **✅ 進行中** |
| 2 | KYC（4 步表單 + admin 審核） | 待 |
| 3 | HD Wallet + 收款（Tatum + ledger） | 待 |
| 4 | 內部互轉 + ledger 餘額 | 待 |
| 5 | 提領 + 平台代付 TRX | 待 |
| 6 | 對帳 + Sweep + 通知 + 匯率 + 深色模式 + onboarding | 待 |
| **7** | **Mobile App（Flutter，雙平台）** | **待** |

### Phase 7 預定範圍（Mobile）

- Flutter (Dart)，iOS + Android
- 透過 OpenAPI 自動生成 Dart API client
- Face ID / 指紋解鎖（`local_auth`）
- 推播（FCM via `firebase_messaging`）
- KYC 拍照（`camera`）+ QR 掃描（`mobile_scanner`）
- TestFlight + Google Internal Testing

---

## 重要設計原則

- **金額一律 Decimal**（後端 `numeric(36,18)`、前端字串）。**禁止 float**
- **私鑰 / mnemonic** 一律 AES-GCM envelope encryption（KEK 從 env 讀）
- **餘額不是 column**：是 ledger entries 累加出來的（Phase 4 起）
- **錯誤訊息**：後端只回 error code + params，翻譯由前端處理
- **不對普通用戶顯示鏈相關術語**：用「收款碼 / 帳戶 / 轉出 / 轉給朋友」

詳見 spec。
