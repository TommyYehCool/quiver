# Quiver Earn V0.5 — W1+W2 開發 Spec

> **Status**: 規劃完成,待律師 OK 後啟動
> **Companion**: `EARN-V05-BITFINEX-AAVE-PLAN.md`(整體 8 週計畫)
> **目的**: 律師會面後第一週能直接 sprint,不用再開規劃會議

這份文件把 V0.5 第 1-2 週的工作切到 ticket 級,每個 ticket 有:
- 對應的 file path
- method signature(可立即動手寫)
- 驗收標準
- 預估工時

---

## 共同前置(W0,~半天)

> 律師會面結束、收到綠燈後第一個工作日做。

### W0-T1:把 PoC adapter ABC 升級為 production interface

**檔案**: `apps/api/app/services/earn/interface.py`(已存在,需擴充)

**目前**(PoC Phase 2):
```python
class YieldProtocol(ABC):
    @abstractmethod
    async def deposit(self, amount: Decimal, ...) -> str: ...
    @abstractmethod
    async def withdraw(self, amount: Decimal, ...) -> str: ...
```

**新增**:
```python
@dataclass(frozen=True)
class StrategyHealth:
    """每個 strategy 的即時健康狀態,用於 rebalance 決策。"""
    name: str
    chain: str
    apy_gross: Decimal
    apy_30d_avg: Decimal | None  # 過去 30 天平均
    tvl_usd: Decimal | None
    utilization_pct: Decimal | None
    is_paused: bool  # 系統判斷異常時可手動暫停
    last_updated_at: datetime


@dataclass(frozen=True)
class PositionSnapshot:
    """Quiver 在某 strategy 的當前部位。"""
    strategy: str
    underlying_amount: Decimal  # 等值 USDT
    receipt_amount: Decimal | None  # aToken / fToken 等
    accrued_interest_30d: Decimal | None  # 過去 30 天結利


class YieldStrategy(ABC):
    """V0.5+ 用的更完整介面(取代 V0 的 YieldProtocol)。"""

    @abstractmethod
    async def get_health(self) -> StrategyHealth: ...

    @abstractmethod
    async def get_position(self) -> PositionSnapshot: ...

    @abstractmethod
    async def deploy(self, amount: Decimal) -> str:
        """把 USDT 部署進 strategy,回傳 reference id (tx hash / offer id)。"""

    @abstractmethod
    async def withdraw(self, amount: Decimal) -> str: ...
```

**驗收**:
- `class BitfinexFundingStrategy(YieldStrategy)` 可以 stub 實作所有 method 不報錯
- 既有 `MockYieldProtocol` / `EarnService` 仍可運作(backwards compat)

**工時**: 0.25 day

---

### W0-T2:新增 alembic migration

**檔案**: `apps/api/alembic/versions/{rev}_earn_v05_init.py`

**新增 tables**:
```sql
-- 每個 strategy 的當前部位
CREATE TABLE earn_strategy_positions (
    id SERIAL PRIMARY KEY,
    strategy VARCHAR(64) NOT NULL UNIQUE,  -- "bitfinex_funding_usdt" / "aave_v3_polygon_usdt"
    chain VARCHAR(32) NOT NULL,             -- "bitfinex" / "polygon"
    underlying_amount NUMERIC(38, 18) NOT NULL DEFAULT 0,
    receipt_amount NUMERIC(38, 18),
    last_apy_gross NUMERIC(8, 6),           -- 0.0500 = 5.00%
    last_synced_at TIMESTAMPTZ NOT NULL,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bitfinex funding offers 紀錄
CREATE TABLE earn_bitfinex_offers (
    id SERIAL PRIMARY KEY,
    bitfinex_offer_id BIGINT UNIQUE,        -- API 回傳
    symbol VARCHAR(8) NOT NULL,             -- "fUSDT"
    amount NUMERIC(38, 18) NOT NULL,
    rate_daily NUMERIC(10, 8) NOT NULL,
    period_days INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL,            -- ACTIVE / MATCHED / EXPIRED / CANCELLED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ
);

CREATE INDEX idx_bitfinex_offers_status ON earn_bitfinex_offers(status);

-- Bitfinex 每日利息紀錄
CREATE TABLE earn_bitfinex_earnings (
    id SERIAL PRIMARY KEY,
    earned_date DATE NOT NULL,
    symbol VARCHAR(8) NOT NULL,
    amount NUMERIC(38, 18) NOT NULL,
    UNIQUE (earned_date, symbol)
);

-- 平台 EVM HOT 錢包 metadata(實際 priv key 加密在 platform_wallets)
CREATE TABLE platform_evm_wallets (
    id SERIAL PRIMARY KEY,
    chain VARCHAR(32) NOT NULL UNIQUE,      -- "polygon" / "ethereum"
    address VARCHAR(64) NOT NULL,
    encrypted_priv_key BYTEA NOT NULL,
    key_version INTEGER NOT NULL,           -- 接到既有 KEK rotation
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**驗收**:
- `alembic upgrade head` 跑完無錯誤
- `\d earn_strategy_positions` 確認欄位
- 寫個 simple insert/select 測試

**工時**: 0.25 day

---

## W1:Bitfinex Funding Strategy(5 個工作日)

### W1-D1:重構 PoC 為 production adapter

**檔案**: `apps/api/app/services/earn/bitfinex_adapter.py`(新建)

**結構**:
```python
class BitfinexFundingStrategy(YieldStrategy):
    """V0.5 主 strategy:Bitfinex USDT Funding market."""

    SYMBOL_AUTH = "fUSDT"   # auth endpoints 用
    SYMBOL_PUBLIC = "fUST"  # public ticker 用

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        http_client: httpx.AsyncClient,
        repo: BitfinexRepo,
    ):
        self._key = api_key
        self._secret = api_secret
        self._client = http_client
        self._repo = repo

    # ──── 內部 helpers
    async def _auth_post(self, path: str, body: dict | None = None) -> Any: ...
    async def _public_get(self, path: str) -> Any: ...

    # ──── YieldStrategy 實作
    async def get_health(self) -> StrategyHealth: ...
    async def get_position(self) -> PositionSnapshot: ...
    async def deploy(self, amount: Decimal) -> str: ...
    async def withdraw(self, amount: Decimal) -> str: ...

    # ──── Bitfinex 特有 method
    async def get_funding_wallet_balance(self) -> Decimal: ...
    async def submit_offer(
        self,
        amount: Decimal,
        rate_daily: Decimal | None,  # None = 跟 FRR
        period_days: int,
    ) -> int:  # 回 bitfinex_offer_id
        """掛 funding offer。"""

    async def cancel_offer(self, offer_id: int) -> None: ...

    async def get_active_offers(self) -> list[BitfinexOffer]: ...
    async def get_active_credits(self) -> list[BitfinexCredit]: ...
    async def get_market_frr(self) -> MarketRates: ...
```

**從 PoC 帶過來但要重寫的部分**:
- `auth_post` 從 sync httpx → async httpx.AsyncClient
- nonce 從全域 ms timestamp → 用 monotonic counter + 計算 base 確保 process restart 後仍單調
- error handling 區分 401(權限) / 429(rate limit) / 500(簽錯)
- 加 retry logic(429 時 exponential backoff,3 次)

**Bitfinex rate limit**: 80 req/min(authenticated)。預先配額:
- 每 5 秒 ≤ 6 req(留 buffer)
- 在 adapter 內加 leaky bucket

**驗收**:
- pytest:用 `respx` mock 所有 4 個 read endpoint,assert 解析正確
- pytest:nonce monotonic test(連送 3 個 request,nonce 嚴格遞增)
- pytest:HMAC signature test(用 known key + body,assert sig 跟手算結果一致)
- live test:跑 `poc_bitfinex_funding.py` 改用新 adapter,結果跟舊 PoC 一致

**工時**: 1 day

---

### W1-D2:get_health / get_position(read-only,不需 write 權限)

**get_health 內容**:
- 抓當前 FRR + 過去 30 天 FRR 平均(用 `/v2/funding/stats/fUST/hist?limit=30`)
- 抓 utilization(同 endpoint)
- TVL = funding market 總 supply(同 endpoint)
- `is_paused`:從 DB 讀 admin 手動 pause flag

**get_position 內容**:
- Funding wallet USDT balance(用 `/v2/auth/r/wallets`)
- Active credits 加總 amount(已借出去的)
- 未配置但在 Funding wallet 的 = idle
- `accrued_interest_30d`:從 DB `earn_bitfinex_earnings` 讀過去 30 天加總

**驗收**:
- mock 完整 wallets response,assert position 計算正確
- mock 1 active credit + 1 idle balance,assert position.underlying_amount = 兩者相加
- live test:跑出實際數字,跟 Bitfinex web UI 一致

**工時**: 0.5 day

---

### W1-D3:deploy / withdraw / submit_offer / cancel_offer(write methods)

**注意**:這天需要 API key 升級到 write 權限(Margin Funding — Offer/cancel + Wallets — Transfer)。

**deploy(amount)** 流程:
1. 檢查 Exchange wallet USDT 餘額 ≥ amount
2. 呼叫 `/v2/auth/w/transfer`:Exchange → Funding wallet,amount
3. 等 30 秒讓 transfer 結算(內部移轉應該秒到,但有時要 1-2 分)
4. submit_offer(amount, rate=None, period=2)— 用 FRR、2 天期
5. 紀錄 offer 到 `earn_bitfinex_offers`
6. 回 offer_id

**withdraw(amount)** 流程:
1. 列出當前 active credits,從**最新**(period 最短)那筆找夠數的
2. 等該 credit period 結束(可能 1-30 天)
3. **alternative**:呼叫 `/v2/auth/w/funding/close` 強制平倉(會被收違約金)
4. credit 結算 → funds 回 Funding wallet
5. transfer Funding → Exchange wallet
6. 回 transfer tx_id

> ⚠️ **withdraw 有時延**:Bitfinex Funding period min 2 days,所以即使我們想立刻撤,也可能要等。
> Quiver 設計保留 20% 流動性在 Tron HOT 就是為這個。
> Bitfinex Funding 部分當「定存」看,不是「活儲」。

**submit_offer(amount, rate, period)** 直接打 `/v2/auth/w/funding/offer/submit`:
```python
body = {
    "type": "LIMIT",
    "symbol": "fUSDT",
    "amount": str(amount),
    "rate": "0" if rate is None else str(rate),  # 0 = use FRR
    "period": period,  # 2-30
    "flags": 0,
}
```

**cancel_offer(offer_id)** 打 `/v2/auth/w/funding/offer/cancel` with `id: offer_id`。

**驗收**(用 sandbox / 我的 testnet 帳號或小額 1 USD):
- transfer Exchange → Funding 1 USDT 成功
- submit 0.5 USDT FRR offer → bitfinex_offer_id 拿到 → DB 寫入
- list active offers 看到剛 submit 的
- cancel 該 offer → 狀態 CANCELLED
- 整個流程 < 1 分鐘

**工時**: 1.5 day(write 操作要小心,慢慢來)

---

### W1-D4:Repository + 整合到 EarnService

**檔案**: `apps/api/app/services/earn/bitfinex_repo.py`(新建)

```python
class BitfinexRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert_offer(self, offer: BitfinexOffer) -> int: ...
    async def update_offer_status(
        self, offer_id: int, status: str, settled_at: datetime | None = None
    ) -> None: ...
    async def list_active_offers(self) -> list[BitfinexOffer]: ...
    async def insert_earning(
        self, date: date, symbol: str, amount: Decimal
    ) -> None: ...  # ON CONFLICT (date, symbol) DO UPDATE
    async def total_earnings_30d(self) -> Decimal: ...
```

**整合到 EarnService**:
- `EarnService.deploy_to_strategy("bitfinex_funding_usdt", amount)` 呼叫 adapter
- `EarnService.get_combined_health()` 抓所有 strategy 的 health,用於 dashboard
- 加一個 cron task `earn_bitfinex_sync_earnings` 每天結算後跑(00:30 UTC),抓昨日 funding earnings 寫入 `earn_bitfinex_earnings`

**驗收**:
- unit test:mock adapter,assert EarnService 把 deploy 結果寫入 DB
- integration test:啟 docker,跑 deploy → 查 DB 看部位
- cron test:模擬一天前的 earnings,跑 sync job 看 DB 寫入

**工時**: 1 day

---

### W1-D5:UI(admin only)+ 文件

**Admin UI**: `apps/web/app/(app)/admin/earn/page.tsx`(新)

- 列表卡片:每個 strategy 一張,顯示
  - strategy name / chain
  - APY (current / 30d avg)
  - position (underlying / receipt)
  - is_paused toggle
- Bitfinex 詳情 panel
  - active offers 列表
  - active credits 列表
  - cancel 按鈕(需 2FA)
- "Manual deploy" 按鈕
  - 輸入 amount,按下後 EarnService.deploy_to_strategy
  - 限 admin、需 2FA、預設 max $10K(防誤操作)

**i18n**:zh-TW + en,新增 `admin.earn.*` namespace。

**文件**:`docs/runbook-earn-v05-ops.md`(新建,2 頁)
- 怎麼看 Bitfinex 部位
- 怎麼手動 deploy / cancel
- 失敗 / API 中斷時的緊急處理
- key rotation 流程

**驗收**:
- admin 用 web UI 可以看 strategy 健康狀態
- 手動 deploy / cancel 正常
- runbook 完整,新人 follow 可以重現

**工時**: 1 day

---

## W2:AAVE V3 Polygon Strategy(5 個工作日)

### W2-D1:Polygon EVM HOT wallet 機制

> 跟 Tron HOT wallet 同邏輯,只是換鏈。複用既有 KEK 加密。

**檔案**: `apps/api/app/services/earn/evm_wallet.py`(新建)

```python
class EvmHotWallet:
    """平台 EVM HOT,類似 Tron HOT,但用在 V0.5 部署 AAVE 等 EVM strategy。"""

    @classmethod
    async def bootstrap(cls, chain: str, kek: bytes) -> EvmHotWallet:
        """產生新 EOA(secp256k1),加密 priv key 存 DB。"""

    @classmethod
    async def load(cls, chain: str, kek: bytes) -> EvmHotWallet:
        """從 DB 讀 + 解密 priv key。"""

    @property
    def address(self) -> str: ...

    async def sign_tx(self, tx_dict: dict) -> str:
        """sign + return raw tx hex,給 sendRawTransaction 用。"""

    async def get_balance(self, rpc_url: str) -> Decimal:
        """讀當前 native balance(MATIC 用來付 gas)。"""
```

**EOA 生成**:
- 用 secp256k1 lib(Python `coincurve` 或 `eth-account`,選 `eth-account`)
- 加 dependency: `eth-account>=0.13`
- priv key 32 bytes,address 從 keccak256(pubkey 後 20 bytes)

**加密**:
- 走既有 KEK(同 user wallet 用的)
- AES-GCM,nonce 隨機 12 bytes
- key_version 接到既有 rotation 系統

**驗收**:
- bootstrap → DB 寫入 → load 出來 priv key 跟 address 一致
- sign 一個假 tx,assert hex 解碼出來的 sender 等於 address
- script: `python -m apps.api.scripts.bootstrap_evm_hot polygon`(類似既有 Tron bootstrap)

**工時**: 1 day

---

### W2-D2:AAVE V3 read methods(用 raw RPC,擴充 PoC #1)

**檔案**: `apps/api/app/services/earn/aave_v3_adapter.py`(新建)

```python
class AaveV3PolygonStrategy(YieldStrategy):
    POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
    USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"  # PoS USDT
    ATOKEN_ADDRESS = "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"

    def __init__(self, rpc: PolygonRpcClient, hot_wallet: EvmHotWallet, repo: AaveRepo):
        ...

    # ──── read(從 PoC 帶過來)
    async def get_supply_rate(self) -> Decimal: ...
    async def get_total_deposits(self) -> Decimal: ...
    async def get_health(self) -> StrategyHealth: ...
    async def get_position(self) -> PositionSnapshot:
        """讀 hot_wallet.address 的 aToken balance。"""

    # ──── write(W2-D3-D4 寫)
    async def deploy(self, amount: Decimal) -> str: ...
    async def withdraw(self, amount: Decimal) -> str: ...
```

**PolygonRpcClient**:
- 多 RPC fallback(就是 PoC #1 的 `RPC_URLS` 那個邏輯)
- async + retry on timeout / rate limit

**read 方法**:
- 直接帶 PoC #1 的 eth_call + abi decode
- 加上 cache(30 秒,避免每次 page load 都打 RPC)

**驗收**:
- get_supply_rate 跟 PoC #1 給的 3.84% 一致
- get_position(空地址)= 0
- get_position(任何已 supply USDT 的地址)正確返回 aToken balance

**工時**: 0.75 day

---

### W2-D3:AAVE supply / withdraw 簽 tx

**用 raw RPC + eth-account 簽,不裝 web3.py**(跟 Tron pattern 一致)。

**supply(amount)** 流程:
1. **Approve**:USDT.approve(POOL_ADDRESS, amount)
   - 如果已 approve unlimited,跳過(node 讀 USDT.allowance)
   - 我們選 approve **exactly amount**,不用 unlimited(更安全)
2. **Pool.supply**:`pool.supply(USDT_ADDRESS, amount, our_address, 0)`
3. wait for receipt(讀 `eth_getTransactionReceipt`,2 個 block confirmation)
4. assert receipt.status == 1
5. 回 tx hash

**withdraw(amount)** 流程:
1. `pool.withdraw(USDT_ADDRESS, amount, our_address)`
2. wait receipt
3. 回 tx hash

**Function selectors 跟 ABI encoding**:
```python
APPROVE_SELECTOR = "0x095ea7b3"  # approve(address,uint256)
SUPPLY_SELECTOR = "0x617ba037"   # supply(address,uint256,address,uint16)
WITHDRAW_SELECTOR = "0x69328dec"  # withdraw(address,uint256,address)

def encode_supply(asset: str, amount: int, to: str, ref_code: int = 0) -> str:
    return (
        SUPPLY_SELECTOR
        + encode_address(asset)
        + encode_uint256(amount)
        + encode_address(to)
        + encode_uint16(ref_code)  # padded to 32 bytes
    )
```

**Gas estimation**:
- 用 `eth_estimateGas`(approve ~50K、supply ~250K、withdraw ~280K)
- gas price 用 `eth_gasPrice` 或 EIP-1559 max-fee/priority-fee
- Polygon 通常 30-50 gwei

**Nonce**:
- 用 `eth_getTransactionCount(our_address, "pending")`
- adapter 自己 cache 並 increment(避免 race)

**驗收**(testnet Amoy):
- 從 faucet 拿 testnet MATIC + USDT
- supply 1 USDT → tx success → aToken balance 增加
- withdraw 0.5 USDT → tx success → aToken balance 減少 0.5
- script: `apps/api/scripts/poc_aave_amoy_smoke.py`

**工時**: 1.5 day(write tx 要慢慢驗,容易踩雷)

---

### W2-D4:Mainnet smoke test(real money)

**前置**:
- bootstrap Polygon HOT wallet
- 從個人錢包送 ~$5 USDT(PoS)+ ~$1 MATIC 進去當 gas
- 確認 hot wallet 餘額

**測試步驟**:
1. supply 1 USDT → 鏈上 explorer 看 tx 成功 + aToken 餘額
2. wait 1 hr,讀 position 看利息累積
3. withdraw 0.5 USDT → 鏈上看 tx + USDT 餘額回升
4. withdraw 全部 → aToken balance = 0

**預期費用**:
- 2 × supply (~$0.05 each) + 2 × withdraw (~$0.06 each) ≈ $0.30 in MATIC gas
- 加上 approve 一次 ~$0.03

**驗收**:
- 4 筆 mainnet tx 全成功
- 鏈上 explorer 截圖入 `runbook-earn-v05-ops.md`
- DB 紀錄 deploy/withdraw 操作

**工時**: 0.5 day(包含 troubleshoot)

---

### W2-D5:Repository + Integration + UI

**檔案**: `apps/api/app/services/earn/aave_repo.py`(新建)

```python
class AaveRepo:
    async def upsert_position(self, position: AaveV3Position) -> None: ...
    async def list_recent_supply_tx(self, limit: int = 10) -> list[AaveSupplyTx]: ...
    async def insert_supply_tx(self, tx: AaveSupplyTx) -> None: ...
```

**整合到 EarnService**:
- `EarnService.list_strategies()` 同時返回 Bitfinex + AAVE 健康狀態
- `StrategyManager` 雛形(W3 才寫完整 rebalance,這週只搞 list/select):
  ```python
  class StrategyManager:
      def __init__(self, strategies: list[YieldStrategy]):
          self._strategies = {s.name: s for s in strategies}

      async def all_health(self) -> list[StrategyHealth]: ...
      def best_for_deploy(self, amount: Decimal) -> str:
          """挑當前最佳 strategy 的 name。
          W2 簡化版:直接挑 APY 最高的;W3 加 rebalance cost 護欄。
          """
  ```

**Admin UI 擴充**:
- `/admin/earn` 新增 AAVE V3 卡片(同 Bitfinex 卡片格式)
- 顯示:supply rate、aToken balance、TVL、最近 supply/withdraw 紀錄
- "Manual deploy to AAVE" 按鈕(限 2FA + max $10K)

**驗收**:
- admin 看到兩張 strategy 卡(Bitfinex / AAVE),都顯示 healthy
- 從 admin UI 手動 deploy 1 USDT 到 AAVE,DB + 鏈上一致
- StrategyManager.best_for_deploy 在當前環境(Bitfinex 5%、AAVE 3.8%)應回傳 "bitfinex_funding_usdt"

**工時**: 1 day

---

## W1+W2 總驗收

完成這兩週後,系統能做的事:

✅ admin 可以看到 Bitfinex 跟 AAVE V3 兩個 strategy 的當前 APY / TVL / 部位
✅ admin 可以手動 deploy / withdraw 任一 strategy(2FA 保護)
✅ Bitfinex 部分:可以從 Exchange wallet 移到 Funding wallet、submit/cancel offer、讀 active credits
✅ AAVE 部分:Polygon 上有自己的 EOA、可以 approve+supply、可以 withdraw,mainnet 真錢小額 smoke 通過
✅ DB 完整紀錄 strategy positions、Bitfinex offers、AAVE supply tx
✅ 既有 user / withdrawal / 等功能無 regression(EarnService 是新模組,不動既有)

**還沒做的**(留給 W3+):
- ❌ 用戶端 deposit/withdraw to Earn(目前 admin only)
- ❌ Bridge(Tron HOT → Polygon EVM HOT)— Symbiosis API 整合
- ❌ Auto-rebalance cron
- ❌ 用戶 statement / dashboard
- ❌ 跨鏈 reconciliation

---

## 預算 / 風險

### 真金白銀的預算(W1+W2 結束時)

| 項目 | 估算 |
|---|---|
| Bitfinex 測試(~$5 USDT 自有資金,跑 deploy + cancel) | $5 |
| Polygon Amoy testnet(免費,faucet 拿) | $0 |
| Polygon mainnet smoke(~$5 USDT + ~$1 MATIC) | ~$6 |
| Infura / Alchemy free tier(夠用 dev) | $0 |
| **小計** | **~$11** |

### 風險登記

| 風險 | 機率 | 緩解 |
|---|---|---|
| Bitfinex API 改版/條款限制台灣用戶 | 低 | 雙因素:備用 OKX 帳號 |
| Polygon RPC 全部 rate-limited | 中 | 4 個 fallback 已做,加付費 Alchemy backup |
| eth-account 簽錯造成資金鎖死 | 低 | testnet smoke 後再上 mainnet |
| AAVE V3 contract 升級 / 暫停 | 低 | 讀 paused 狀態做護欄,is_paused → 不 deploy |
| 我們 nonce 邏輯 race | 中 | adapter 內 nonce lock + always read pending |

---

## 律師會面後第一週的具體 day-by-day

| Day | 任務 |
|---|---|
| Day 1(週一) | 律師會面 → 拿到綠燈或紅燈條件 |
| Day 1 PM | 如綠燈:W0-T1 + W0-T2(interface + migration) |
| Day 2 | W1-D1 重構 PoC adapter |
| Day 3 | W1-D2 read methods + tests |
| Day 4 | W1-D3 上半:申請 Bitfinex API key write 權限 + 設 IP whitelist |
| Day 5 | W1-D3 下半:write methods 實作 + 小額 1 USDT 測試 |
| Day 6-7 | 週末 |
| Day 8(週一) | W1-D4 Repo + EarnService 整合 |
| Day 9 | W1-D5 Admin UI |
| Day 10 | W2-D1 EVM HOT wallet bootstrap |
| Day 11 | W2-D2 AAVE read |
| Day 12-13 | W2-D3 AAVE write + Amoy smoke |
| Day 14 | W2-D4 mainnet smoke |
| Day 15 | W2-D5 Repo + Integration + UI |

→ **2 週(10 工作日)**內 W1+W2 spec 全完成。

---

## 開始前 checklist

律師會面前**先**做(完全不用等律師同意):

- [ ] 申請 Polygon Alchemy 免費 API key(備用 RPC)
- [ ] 確認個人錢包有 ~$10 USDT(PoS)on Polygon + ~$2 MATIC,放在 ready-to-use 錢包
- [ ] 確認 Bitfinex 帳戶可以開 IP whitelist(免費版都可以)
- [ ] 看一下 docs.aave.com 對 V3 supply/withdraw 的 example code,熟悉一下 ABI

律師會面**完**做(綠燈後立刻):

- [ ] Bitfinex API key:把 read-only 權限加上 Margin Funding write + Wallets transfer + 設 IP whitelist
- [ ] 開始 W0-T1 + W0-T2(同一天可做完)
- [ ] 進入 W1 sprint

---

_Last updated: 2026-05-01 — 律師會面前最終版_
