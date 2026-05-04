# Quiver

> A custodial USDT wallet that auto-lends on Bitfinex Funding to earn passive
> yield, while keeping users' funds in their **own** Bitfinex accounts.
> Self-custody Path A — Quiver never holds, withdraws, or trades user funds.

**Production**: [quiverdefi.com](https://quiverdefi.com) — live since 2026-05.
Currently in **Friend tier beta** (first 10 connectors, 0 fees).

---

## Stack at a Glance

| Layer            | Tech |
|------------------|------|
| Backend API      | Python 3.12 · FastAPI · async/await |
| ORM + Migrations | SQLAlchemy 2 (async) · asyncpg · Alembic |
| Database         | PostgreSQL 16 |
| Background jobs  | arq (Redis-backed task queue) |
| Cache + queue    | Redis 7 |
| Frontend         | Next.js 14 (App Router) · React 18 · TypeScript 5 |
| Frontend styling | Tailwind CSS · Radix UI · shadcn/ui pattern |
| i18n             | next-intl (zh-TW / en / ja) |
| Container        | Docker + Docker Compose |
| Reverse proxy    | nginx |
| Hosting          | Vultr Tokyo 4GB (single VM) |
| Domain + DNS     | quiverdefi.com on Cloudflare (Registrar + Proxy) |
| SSL/TLS          | Cloudflare Flexible (visitor↔CF HTTPS, CF↔origin HTTP) |
| Email            | Resend (transactional, verified domain) |
| Notifications    | Telegram Bot API (event push) + in-app bell + email |
| Auth             | Cookie sessions + Google OAuth + optional TOTP 2FA |
| Blockchain RPC   | Tatum (Tron mainnet, USDT-TRC20) |
| Lending venue    | Bitfinex Funding API (HMAC-SHA384) |
| Error tracking   | Sentry (optional, configurable) |
| Linting / typing | ruff · mypy · ESLint · TypeScript strict |
| Testing          | pytest · pytest-asyncio · respx · hypothesis |

---

## Repo Structure

```
quiver/
├── apps/
│   ├── api/              # FastAPI backend + arq worker
│   │   ├── app/
│   │   │   ├── api/      # HTTP route handlers (one file per resource)
│   │   │   │   ├── admin/   # Admin-only endpoints
│   │   │   │   ├── earn.py
│   │   │   │   ├── kyc.py
│   │   │   │   ├── telegram.py
│   │   │   │   ├── wallet.py
│   │   │   │   └── ...
│   │   │   ├── core/     # Config, logging, DB connection
│   │   │   ├── models/   # SQLAlchemy ORM models
│   │   │   ├── schemas/  # Pydantic request/response schemas
│   │   │   ├── services/ # Business logic
│   │   │   │   ├── earn/    # Bitfinex Funding auto-lend pipeline
│   │   │   │   │   ├── auto_lend.py     # Dispatcher + finalizer
│   │   │   │   │   ├── reconcile.py     # 5-min cron, spike detection
│   │   │   │   │   ├── bitfinex_adapter.py
│   │   │   │   │   ├── perf_fee.py      # Weekly accrual + dunning
│   │   │   │   │   ├── notifications.py # Telegram event formatters
│   │   │   │   │   └── ...
│   │   │   │   ├── ledger.py            # Double-entry bookkeeping
│   │   │   │   ├── tatum.py             # Tron RPC (Tatum)
│   │   │   │   ├── telegram.py          # Telegram bot service
│   │   │   │   ├── email.py             # Resend wrapper
│   │   │   │   └── wallet.py            # HD key derivation, sweeps
│   │   │   ├── main.py                  # FastAPI app + middleware
│   │   │   └── worker.py                # arq worker entry + cron defs
│   │   ├── alembic/      # DB migrations (0001 → 0022)
│   │   ├── tests/        # pytest test suite
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   └── web/              # Next.js frontend
│       ├── app/[locale]/   # localized routes (zh-TW / en / ja)
│       │   ├── (marketing)/  # public landing
│       │   ├── (auth)/       # login flows
│       │   ├── (app)/        # logged-in user surfaces
│       │   │   ├── (user)/   # user dashboard, wallet, earn, etc.
│       │   │   └── admin/    # admin surfaces
│       │   ├── rank/         # public leaderboard (no auth)
│       │   └── legal/        # ToS, privacy, public legal pages
│       ├── components/   # Shared React components
│       │   ├── earn/      # Earn-specific cards
│       │   ├── common/    # User/admin chrome (sidebar, header)
│       │   └── ui/        # Generic primitives (Card, Button, etc.)
│       ├── lib/api/      # Fetch clients (browser + server)
│       ├── messages/     # i18n dictionaries (zh-TW.json, en.json, ja.json)
│       └── Dockerfile    # Multi-stage (deps / dev / builder / prod)
├── infra/
│   └── nginx/            # Reverse proxy config
├── docs/                 # Internal architecture docs + roadmaps
│   ├── EARN-PATH-A-MVP-PLAN.md
│   ├── EARN-PATH-A-RUNBOOK.md
│   ├── PRODUCTION-CHECKLIST.md
│   └── adr/              # Architecture decision records
├── docker-compose.yml          # Base (dev defaults)
├── docker-compose.prod.yml     # Prod overrides (standalone bundle, !reset volumes)
└── .env                        # Single env file for all services (gitignored)
```

---

## Architecture

### Backend (`apps/api`)

A single FastAPI process serves the HTTP API, plus an `arq` worker process
runs background jobs and crons against the same Postgres + Redis:

```
nginx (HTTPS termination via CF)
  ↓
api container (FastAPI · uvicorn) ←──── Postgres (asyncpg)
  ↑                                ↘
  ↓ enqueue                          Redis ← arq queue
worker container (arq) ─────────────────┘
  ↓
External: Bitfinex API, Tatum, Telegram, Resend
```

**Crons** (defined in `app/worker.py`):
- `cron_sweep_all` — sweep user deposits to platform HOT wallet
- `cron_heartbeat_watchdog` — alert if any service stalls
- `cron_earn_reconcile` — every 5 min: spike detection, position reconcile, auto-renew lent funds
- `cron_earn_perf_fee` — weekly Mon 02:00 UTC: accrue + settle perf fees, run dunning state machine
- `cron_subscription_renewal` — daily: charge Premium subs, mark expired

**Auth**: Cookie sessions backed by `login_sessions` table. Google OAuth is
the only signup path. Optional TOTP 2FA, IP-allowlisted withdrawal whitelist.

**Encryption**: Master HD seed encrypted with AES-GCM + KEK envelope.
KEK lives in env (rotatable). Bitfinex API keys + 2FA secrets use the same
envelope pattern. See `app/services/crypto.py`.

### Frontend (`apps/web`)

Next.js 14 App Router with **server components by default**, locale-prefixed
routes (`/[locale]/...`), and per-page i18n via next-intl.

**Routing groups**:
- `(marketing)` — public landing
- `(auth)` — login / signup / OAuth callback
- `(app)/(user)` — logged-in user surfaces (sidebar chrome)
- `(app)/admin` — admin surfaces (separate violet chrome + warning banner)
- `rank/` — **public** leaderboard (no auth, screenshot-friendly)
- `legal/` — ToS, privacy, etc.

**Client/server split**: most data fetching happens on the server
(`lib/api/*-server.ts`); client components handle interactivity
(toggles, forms, polls). The server fetcher proxies to `http://api:8000`
inside the docker network; the browser uses relative URLs proxied through nginx.

**Build**: `next build` with `output: "standalone"` in production (multi-stage
Dockerfile, see "Deployment" below).

### Database (PostgreSQL 16)

- **Migrations**: Alembic, currently at `0022_user_leaderboard_optin`.
  Each migration is reversible; production rolls forward only.
- **Backup**: nightly volume snapshot via Vultr (TODO: verify automation)
- **Volume**: `postgres_data` named volume, persists across container recreates

Key tables (incomplete):
- `users`, `login_sessions`, `kyc_submissions`
- `accounts`, `ledger_transactions`, `ledger_entries` (double-entry)
- `onchain_txs`, `withdrawal_requests`
- `earn_accounts`, `earn_positions`, `earn_position_snapshots`
- `earn_bitfinex_connections` (encrypted API keys)
- `earn_fee_accruals` (perf fee bookkeeping)
- `notifications`, `audit_logs`
- `referral_bindings`, `referral_payouts`
- `subscriptions` (Premium)

### Wallet / Blockchain

- **Network**: Tron mainnet, USDT-TRC20 only (no other chains in production).
- **HD derivation**: BIP32 from a single master seed. Per-user receive
  addresses, plus platform addresses for HOT (sweep destination), COLD
  (manual offline backup), and FEE_PAYER (TRX gas funding).
- **Tatum** is the RPC provider — handles broadcast, balance fetch,
  webhook for incoming deposits.
- **Sweep**: idle user balances above threshold flow into HOT every 30 min.
- **Auto-lend**: HOT broadcasts to user's own Bitfinex Funding deposit
  address; thereafter funds never leave the user's Bitfinex account.

### Earn (Path A self-custody)

The product's main loop:

```
User deposits USDT to Quiver
  ↓ sweep_user
Quiver HOT wallet
  ↓ auto_lend_dispatcher (broadcasts on-chain to Bitfinex Funding)
User's own Bitfinex Funding wallet
  ↓ auto_lend_finalizer (waits for credit, submits 5-tier ladder)
Bitfinex active funding offers
  ↓ borrowers fill them
LENT (earning interest) ──→ matures every 2-30 days ──→ funds idle
  ↓ cron_earn_reconcile (every 5 min)
  └─ auto-renew with fresh ladder ──→ loop
```

**Strategy presets** (`EarnStrategyPreset`): Conservative / Balanced /
Aggressive, each driving its own ladder shape + period thresholds. See
`services/earn/auto_lend.py` `LADDER_TRANCHES_*` and
`PERIOD_RATE_THRESHOLDS_APR_*`.

**Spike detection**: each reconcile run looks for new active credits at
≥ 12% APR (`SPIKE_APR_THRESHOLD`) and fires a Telegram notification —
the screenshot-worthy moments that drive social acquisition.

**Perf fee**: weekly cron (Mon 02:00 UTC) accrues fees from snapshot
data, attempts to settle from user's Quiver wallet balance, and runs a
dunning state machine that auto-pauses auto-lend after 4 unpaid weeks.

### Notifications

Three independent channels for different event classes:

| Channel  | Used for | Setup |
|----------|----------|-------|
| **Email** (Resend) | KYC approve/reject, transfer received, withdrawal events, admin digests | `RESEND_API_KEY` + verified domain `quiverdefi.com` |
| **Telegram** (bot push) | Lent success, spike captured, auto-renew, dunning paused/resumed | `TELEGRAM_BOT_TOKEN` + `_USERNAME` + `_WEBHOOK_SECRET`; user opts in via `/earn/bot-settings` |
| **In-app** (notification bell) | All of the above, mirrored — fallback when other channels fail | None; always on |

All three are **fire-and-forget** from the underlying business logic so a
Telegram outage / Resend hiccup never blocks an auto-lend cycle or KYC
approval.

---

## External Services

| Service | Purpose | Plan |
|---------|---------|------|
| **Vultr** Tokyo 4GB VM | Single-host hosting | ~$24/mo |
| **Cloudflare** | DNS + SSL (Flexible) + DDoS | Free |
| **Resend** | Transactional email | Free 3k/mo (currently far below cap) |
| **Telegram Bot API** | Push notifications + bind webhook | Free |
| **Google OAuth** | User signup | Free |
| **Tatum** | Tron RPC + deposit webhooks | Free tier |
| **Bitfinex** | Funding API (per-user keys, not platform key in Path A) | Per user |
| **Sentry** | Error tracking | Optional, free tier |

---

## Deployment

**Topology**: single VM running 6 containers via Docker Compose:
`api` · `worker` · `web` · `nginx` · `postgres` · `redis`.

### Pushing changes (current workflow)

```bash
# 1. Sync source files (no git on prod working tree)
rsync -av --relative <changed files> quiver-prod:/home/quiver/quiver/

# 2. (If schema changed) run migration
ssh quiver-prod "cd /home/quiver/quiver && docker compose exec -T api alembic upgrade head"

# 3a. For Python changes (api / worker)
#     restart works because uvicorn --reload picks up source mounts in dev,
#     but for env var changes use force-recreate
ssh quiver-prod "cd /home/quiver/quiver && docker compose restart api worker"

# 3b. For Web (.tsx / .ts / messages/*.json)
#     prod runs the standalone bundle, must rebuild
ssh quiver-prod "cd /home/quiver/quiver && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build web && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate web"

# 4. Always restart nginx after recreating api/web (stale upstream DNS otherwise)
ssh quiver-prod "cd /home/quiver/quiver && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx"
```

### Critical gotchas

- **Env var changes** require `--force-recreate`, not `restart` — env_file is
  baked at container creation time
- **Web prod build** uses `output: "standalone"`; never bind-mount `./apps/web`
  in prod (would shadow the standalone bundle). `docker-compose.prod.yml` uses
  `volumes: !reset []` to ensure this
- **`NEXT_PUBLIC_*` env vars** are baked at BUILD time, not runtime — the
  Dockerfile doesn't currently pass them, so any client-side `process.env.NEXT_PUBLIC_*`
  read will be `undefined` in prod. Use the runtime `getApiBase()` helper instead

### Local development

```bash
# Setup .env (copy from .env.example if exists, else ask Tommy)
cp .env.example .env

# Start everything
docker compose up -d

# api: http://localhost:8000
# web: http://localhost:3000
# Postgres: localhost:5432 (user/pass in .env)
# Redis: localhost:6379

# Run tests
docker compose exec api pytest tests/

# Apply pending migrations
docker compose exec api alembic upgrade head

# Create new migration
docker compose exec api alembic revision -m "description" --autogenerate
```

---

## Observability

- **Structured logs** via `structlog` (JSON in prod, pretty in dev). Every
  log line carries `request_id`, `path`, `level`, `event`. Aggregated via
  `docker compose logs`.
- **Sentry** (optional) — configure `SENTRY_DSN` in `.env`. Catches
  unhandled exceptions in api + worker.
- **Heartbeat watchdog** cron alerts on stalled services.
- **Audit log** (`audit_logs` table) records every admin action and
  user-initiated state change (KYC approve, withdrawal, key rotation).

Future:
- Per-user funnel events for onboarding observability
- `/admin/earn` enriched with stuck-position / dunning-paused / preset-distribution cards

---

## Testing

```bash
# Full suite (currently 67 tests, ~17s)
docker compose exec api pytest tests/

# Verbose
docker compose exec api pytest tests/ -v

# Single file
docker compose exec api pytest tests/test_auto_lend_ladder.py
```

Coverage focus: pure functions in the financial path
(`_build_ladder`, `_select_period_days`, `previous_iso_week_range`)
and the Bitfinex adapter write methods (mocked with `respx`).

DB-backed tests (e.g., `evaluate_dunning`) are deferred until a
testcontainers Postgres fixture is in place.

---

## Security Posture

- **Self-custody by design** — user funds never enter Quiver custody.
  Bitfinex API keys are scoped to Funding only (no withdraw, no trade).
- **Secrets**: master seed + Bitfinex API keys + TOTP secrets all encrypted
  at rest with AES-GCM under a single rotatable KEK.
- **TLS**: Cloudflare-terminated; origin is HTTP behind firewall.
  Future: switch to Full SSL with Cloudflare Origin Cert when cycles allow.
- **DB access**: Postgres only listens on the docker network, not exposed.
- **Server hardening**: SSH key-only login, ufw firewall, fail2ban,
  unprivileged `quiver` user.
- **2FA**: Optional TOTP for user accounts; required for admins (TODO).
- **Rate limiting**: TODO — currently no API rate limiter.
- **Audit log**: every state change recorded with actor + IP + UA.

---

## Roadmap

Active tracks (from `docs/`):

- **F-Phase 3 / Path A** ✅ — self-custody auto-lend MVP shipped
- **F-4 series** ✅ — Friend tier (a) + referral (b) + Premium (c) + ToS (d)
- **F-5a series** ✅ — bot strategy upgrades:
  - 3.1 spike detection + 5min cron
  - 3.2 order-book-aware pricing
  - 3.3 5-tier laddered offers
  - 3.4 dynamic period selection
  - 3.5 strategy presets (Conservative/Balanced/Aggressive)
  - 4.1–4.3 Telegram bot binding + event notifications + public leaderboard
- **F-5b series** ✅ — visibility:
  - 1 strategy performance dashboard + public stats
  - 2 perf fee status card + dunning auto-pause
  - 3 pure-function tests for ladder/period/dates
- **Backlog**:
  - Onboarding funnel observability
  - Admin observability cards (`/admin/earn`)
  - Mobile responsive audit
  - TG channel `@QuiverWins` auto-post
  - Spike pool active reserve (deferred from F-5a-3.4)
  - V0.5 Commercial mode (commingled custody) — **not on the active roadmap**;
    intentionally deferred to keep regulatory surface minimal

For detailed phase plans see `docs/EARN-PATH-A-MVP-PLAN.md` and
`docs/EARN-PATH-A-RUNBOOK.md`.

---

## Contact

Built solo by Tommy Yeh ([@TommyYeh](https://t.me/TommyYeh)).
Feedback / bug reports: DM on Telegram, or email
[exfantasy7wolves@gmail.com](mailto:exfantasy7wolves@gmail.com).
