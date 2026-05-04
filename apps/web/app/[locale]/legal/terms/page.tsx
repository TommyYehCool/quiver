/**
 * 服務條款(範本)— phase 6E-5,F-4d 加 Earn / 績效費 / Referral / Premium 條款。
 *
 * ⚠ 此為佔位範本。上線前必須給律師 review,並依台灣金管會 / 個資法 / 洗錢防制法
 *   實際業務需要調整。
 *
 * 注意:本頁手續費 / 門檻數字必須跟後端 settings 一致(`.env` 的 WITHDRAWAL_FEE_USDT
 * / WITHDRAWAL_LARGE_THRESHOLD_USD / MIN_WITHDRAWAL_USDT、Earn fee_policy 的
 * FRIEND_CAP / TIER_DEFAULT_FEE_BPS、premium policy 的 PREMIUM_MONTHLY_PRICE_USDT 等)。
 * 改任何數字都要同步:
 *   1. 改 `.env` 那邊的值或對應 policy 模組常數
 *   2. 改本頁的數字
 *   3. bump 後端 `TOS_CURRENT_VERSION`(account.py),強迫用戶重新同意
 */

type Locale = "zh-TW" | "en" | "ja";

interface SectionBody { h: string; body: string }
interface SectionList { h: string; items: string[] }

const STRINGS: Record<Locale, {
  title: string;
  lastUpdated: string;
  version: string;
  draftWarning: string;
  // Wallet-side clauses (1-7)
  s1: SectionBody;
  s2: SectionList;
  s3: SectionBody;
  s4: SectionList;
  s5: SectionBody;
  s6: SectionBody;
  s7: SectionBody;
  // Earn / Premium clauses (8-11) — added in F-4d
  sEarn: SectionBody;
  sPerfFee: SectionList;
  sReferral: SectionList;
  sPremium: SectionList;
  // Meta clauses (12-14) — renumbered in F-4d
  s8: SectionBody;
  s9: SectionBody;
  s10: SectionBody;
}> = {
  "zh-TW": {
    title: "服務條款",
    lastUpdated: "最後更新:2026-05-04",
    version: "版本:2026-05-04-v2",
    draftWarning: "⚠ 本頁為範本,正式上線前需請律師 review 並依實際業務調整。",
    s1: {
      h: "1. 服務說明",
      body: "Quiver(以下稱「本服務」)為一個提供 USDT(TRC-20)託管錢包與選用 Earn 自動放貸協助工具的平台,包含入金、內部轉帳、提領、Earn(Bitfinex 自動放貸串接)、推薦計畫、Premium 訂閱等功能。本服務由 [公司名稱] 經營。",
    },
    s2: {
      h: "2. 帳戶註冊與身分驗證(KYC)",
      items: [
        "使用者須滿 18 歲。",
        "須完成身分驗證(KYC)後方可使用敏感功能(轉帳、提領、Earn 連接)。",
        "禁止為他人代操、共用帳戶。",
      ],
    },
    s3: {
      h: "3. 安全責任",
      body: "使用者有責任保護其登入憑證、二次驗證裝置。本服務不會主動詢問用戶密碼或 TOTP 驗證碼。如懷疑帳戶遭未授權使用,請立即聯絡客服。",
    },
    s4: {
      h: "4. 錢包手續費與限額",
      items: [
        "內部轉帳免手續費。",
        "提領手續費:每筆 1 USDT(隨網路 gas 費用調整,變更前會通知)。",
        "最低提領金額:5 USDT(避免低於手續費的微額提領)。",
        "大額提領(≥ 1,000 USD)需經人工審核,可能需 1-3 個工作日。",
      ],
    },
    s5: {
      h: "5. 禁止行為",
      body: "使用者不得從事洗錢、詐欺、資助恐怖主義、違反制裁名單等行為。本服務有權於必要時凍結帳戶並通報主管機關。",
    },
    s6: {
      h: "6. 服務中斷與責任限制",
      body: "因不可抗力(天災、戰爭、區塊鏈分叉、第三方服務商中斷等)導致的服務中斷,本服務不承擔賠償責任。使用者持有的 USDT 由本服務以託管型態保管,但鏈上資產風險仍存在(智能合約風險、地址洩漏等)。",
    },
    s7: {
      h: "7. 帳戶終止",
      body: "使用者可隨時於設定頁申請刪除帳戶。本服務於確認餘額為 0 後執行 soft delete:個人資料遮罩、帳戶標記為已刪除,但交易紀錄依法保留 7 年(會計法第 38 條 / 稅捐稽徵法第 30 條)。",
    },

    // F-4d 新增條款 ─────────────────────────────────────

    sEarn: {
      h: "8. Quiver Earn 服務(Bitfinex 自動放貸串接)",
      body:
        "Earn 為選用功能(opt-in),使用者自願提供其本人持有之 Bitfinex API 金鑰(僅需 Margin Funding 讀寫權限,「絕不」要求 Withdrawal 權限)及 Funding 錢包之 TRC-20 入金地址。本服務據此自動將使用者於 Quiver 之 USDT 餘額轉至其本人 Bitfinex Funding 錢包,並於 Bitfinex 上自動掛 / 撤 / 續 funding offer 以協助賺取利息。使用者資金始終存放於其本人 KYC 之 Bitfinex 帳戶內,本服務無提現權限,亦無權將資金轉出至其他帳戶。Bitfinex 為獨立第三方平台,其平台事故、停運、破產、政策調整或鏈上事件等所致之任何損失,本服務不負賠償責任。使用者可隨時於 Bitfinex 端撤銷該 API 金鑰,撤銷後本服務即無法再操作其 Bitfinex 帳戶。",
    },
    sPerfFee: {
      h: "9. 績效費(performance fee)",
      items: [
        "本服務僅就使用者於 Earn 實際取得之利息收入抽取績效費,「永遠不從本金抽取」。",
        "費率分級:Friend 等級(前 10 名透過自助式連接者)5%;Public 等級(其餘使用者)15%;Premium 訂閱有效期間 0%。Friend 名額額滿後,新使用者一律以 Public 等級計算。",
        "結算週期:每週一 UTC 02:00 結算上週(週一至週日)之利息收入,並按當時適用費率計算績效費,寫入帳本。",
        "扣款方式:於上述結算後,自使用者 Quiver 主錢包餘額扣款。如餘額不足,該筆績效費維持 ACCRUED 狀態,於後續週期重試,期間使用者 Earn 服務不受影響。",
        "本服務保留依市場條件、合規要求等因素調整費率分級之權利,任何重大變更均將於 30 日前通知並要求重新同意本條款。",
      ],
    },
    sReferral: {
      h: "10. 推薦計畫(Referral)",
      items: [
        "每位使用者可自選一組 4-12 字元 [A-Z0-9] 之推薦碼,設定後不可由使用者自行變更(如有特殊情形需聯絡客服協助)。保留字(admin / quiver / support 等)及已被他人使用之碼不得登記。",
        "新用戶或尚未綁定推薦人之既有用戶,可於 Earn 連接時或推薦頁面輸入他人推薦碼以建立推薦關係。每位使用者僅能綁定一位推薦人,綁定後不可變更。系統會自動偵測並阻擋自我推薦及循環推薦。",
        "分潤比例:被推薦人(以下稱「下線」)每次被收績效費,直邀人(L1)獲得該績效費之 10%,L2(下線之推薦人之上一層)獲得 5%。本服務保留 85%(雙層皆觸發時)。",
        "分潤窗口:6 個月,自下線「第一筆」績效費結算當日起算;窗口結束後不再產生分潤。",
        "撥款方式:即時撥款 — 績效費結算當下,分潤即自動撥入推薦人之 Quiver 主錢包,無須額外領取動作。最低撥款門檻 0.01 USDT,低於此金額之分潤捨去。",
        "推薦碼僅限使用者本人合法使用,禁止以詐欺、機器人、自動化或不正當方式生成下線。違反者本服務有權追回已撥分潤、終止推薦資格並終止帳戶。",
      ],
    },
    sPremium: {
      h: "11. Premium 訂閱",
      items: [
        "Premium 月費 9.99 USDT,訂閱期間使用者於 Earn 之績效費為 0%(取代第 9 條之分級費率)。",
        "扣款方式:訂閱當下立即自使用者 Quiver 主錢包扣取首期月費;之後每 30 日自動續訂並扣款一次。",
        "取消政策:可隨時於 Premium 頁面取消;取消後當期內仍享有 0% 績效費直至期末,期末後失效,績效費恢復為 Friend / Public 一般分級。已扣費用不退還。取消後尚未到期前可隨時恢復(復原)。",
        "餘額不足:如自動續訂時 Quiver 主錢包餘額不足,訂閱進入 PAST_DUE 狀態 7 日寬限期,期間仍享有 0% 績效費,系統將每日重試扣款。寬限期屆滿仍未成功扣款,訂閱自動轉為 EXPIRED,績效費恢復為一般分級;使用者可隨時透過頁面重新訂閱。",
        "訂閱不適用推薦分潤(訂閱費用不會分潤給推薦人)。",
        "本服務保留依營運成本調整訂閱價格之權利,既有訂閱者於現有訂閱週期內不受新價格影響;新價格將於下一個續訂週期適用,並於 30 日前通知。",
      ],
    },

    // 元條款 ─────────────────────────────────────────

    s8: {
      h: "12. 條款變更",
      body: "本服務保留隨時修訂本條款的權利。重大變更會通知使用者並要求重新接受。",
    },
    s9: {
      h: "13. 準據法與管轄",
      body: "本條款適用中華民國法律。因本服務所生爭議,雙方合意以台灣台北地方法院為第一審管轄法院。",
    },
    s10: { h: "14. 聯絡方式", body: "如有疑問,請來信:[support@example.com]" },
  },

  en: {
    title: "Terms of Service",
    lastUpdated: "Last updated: 2026-05-04",
    version: "Version: 2026-05-04-v2",
    draftWarning: "⚠ This page is a template. It must be reviewed by legal counsel and adjusted to actual business operations before production launch.",
    s1: {
      h: "1. Service description",
      body: "Quiver (the \"Service\") is a platform providing custodial wallet services for USDT (TRC-20) and an optional Earn auto-lending coordination tool, including deposits, internal transfers, withdrawals, Earn (Bitfinex auto-lending integration), referral program, and Premium subscription. The Service is operated by [Company Name].",
    },
    s2: {
      h: "2. Account registration and identity verification (KYC)",
      items: [
        "Users must be at least 18 years old.",
        "Identity verification (KYC) must be completed before using sensitive features (transfers, withdrawals, Earn connection).",
        "Operating accounts on behalf of others or sharing accounts is prohibited.",
      ],
    },
    s3: {
      h: "3. Security responsibility",
      body: "Users are responsible for protecting their login credentials and 2FA devices. The Service will never proactively ask for your password or TOTP code. If you suspect unauthorized access, contact customer support immediately.",
    },
    s4: {
      h: "4. Wallet fees and limits",
      items: [
        "Internal transfers are free of charge.",
        "Withdrawal fee: 1 USDT per transaction (subject to adjustment based on network gas costs; changes will be announced in advance).",
        "Minimum withdrawal amount: 5 USDT (to avoid micro-withdrawals below the fee).",
        "Large withdrawals (≥ 1,000 USD) require manual review and may take 1–3 business days.",
      ],
    },
    s5: {
      h: "5. Prohibited conduct",
      body: "Users may not engage in money laundering, fraud, financing of terrorism, or violations of sanctions lists. The Service reserves the right to freeze accounts and notify competent authorities when necessary.",
    },
    s6: {
      h: "6. Service interruption and limitation of liability",
      body: "We are not liable for service interruptions caused by force majeure (natural disasters, war, blockchain forks, third-party provider outages, etc.). USDT held by users is custodied by the Service, but on-chain asset risks still exist (smart-contract risk, address leakage, etc.).",
    },
    s7: {
      h: "7. Account termination",
      body: "Users may request account deletion at any time on the Settings page. After confirming the balance is 0, the Service performs a soft delete: personal data is masked and the account is marked as deleted, but transaction records are retained for 7 years as required by law (Accounting Act Article 38 / Tax Collection Act Article 30).",
    },

    sEarn: {
      h: "8. Quiver Earn services (Bitfinex auto-lending integration)",
      body:
        "Earn is an optional (opt-in) feature. Users voluntarily provide their own Bitfinex API key (limited to Margin Funding read/write permissions; the Service will NEVER request Withdrawal permission) and the TRC-20 deposit address of their Bitfinex Funding wallet. Based on this, the Service automatically transfers USDT from the user's Quiver balance to their own Bitfinex Funding wallet and automatically posts / cancels / renews funding offers on Bitfinex on the user's behalf. User funds always reside in the user's own KYC'd Bitfinex account; the Service has no withdrawal permission and cannot move funds to other accounts. Bitfinex is an independent third-party platform; the Service is not liable for any losses arising from Bitfinex platform incidents, downtime, insolvency, policy changes, or on-chain events. Users may revoke the Bitfinex API key at any time, immediately preventing further actions by the Service.",
    },
    sPerfFee: {
      h: "9. Performance fee",
      items: [
        "The Service charges a performance fee solely on interest income actually earned through Earn. The fee is NEVER charged on principal.",
        "Tier rates: Friend tier (the first 10 users who self-service connect) 5%; Public tier (all subsequent users) 15%; 0% during an active Premium subscription. Once the Friend cap is full, all new connections are calculated at the Public tier.",
        "Settlement cadence: every Monday at 02:00 UTC the Service settles interest income from the previous Monday–Sunday and computes the performance fee at the then-applicable rate, recording it to the ledger.",
        "Collection: after the above settlement, the fee is debited from the user's main Quiver wallet balance. If the balance is insufficient, the accrual remains in ACCRUED status and is retried in subsequent cycles; Earn services continue to operate during this period.",
        "The Service reserves the right to adjust tier rates based on market conditions, regulatory requirements, or other factors. Any material change will be notified at least 30 days in advance and require re-acceptance of these Terms.",
      ],
    },
    sReferral: {
      h: "10. Referral program",
      items: [
        "Each user may choose one referral code consisting of 4–12 [A-Z0-9] characters. Once set, the code cannot be changed by the user (contact support for exceptional cases). Reserved words (admin / quiver / support, etc.) and codes already in use cannot be registered.",
        "New users or existing users not yet bound to a referrer may enter another user's referral code during Earn connection or via the referral page to establish a referral relationship. Each user may bind to only one referrer, ever. The system automatically detects and blocks self-referrals and circular referrals.",
        "Revshare rates: each time a referee is charged a performance fee, the direct (L1) referrer receives 10% of that fee, and the L2 referrer (the referrer's referrer) receives 5%. The Service retains 85% (when both levels are active).",
        "Revshare window: 6 months, starting from the day of the referee's first performance-fee settlement; no further revshare is generated after the window closes.",
        "Payout method: real-time — at the moment a performance fee settles, the revshare is automatically credited to the referrer's main Quiver wallet, no claim action needed. Minimum payout threshold is 0.01 USDT; amounts below this are discarded.",
        "Referral codes are restricted to lawful, personal use. Generating downstream referrals through fraud, bots, automation, or other illegitimate means is prohibited. The Service reserves the right to claw back paid revshare, terminate referral eligibility, and terminate the account for violations.",
      ],
    },
    sPremium: {
      h: "11. Premium subscription",
      items: [
        "Premium costs 9.99 USDT per month. While the subscription is active, the user's Earn performance fee is 0% (overriding the tier rates in Section 9).",
        "Billing: the first month is debited from the user's main Quiver wallet immediately upon subscribing; thereafter, the subscription auto-renews and is debited every 30 days.",
        "Cancellation: users may cancel at any time on the Premium page. After cancellation, 0% performance fee continues to apply through the end of the current period and the subscription expires at period end, after which the performance fee reverts to the Friend / Public tier rate. Paid fees are non-refundable. Cancellation can be reversed (resumed) at any time before period end.",
        "Insufficient balance: if a renewal fails because the Quiver wallet balance is insufficient, the subscription enters PAST_DUE status with a 7-day grace period during which 0% performance fee continues to apply; the system retries the charge daily. If the grace period expires without successful collection, the subscription automatically becomes EXPIRED and the performance fee reverts to the standard tier rate; the user may resubscribe at any time via the page.",
        "Subscription fees are NOT subject to referral revshare (referrers do not earn from subscription payments).",
        "The Service reserves the right to adjust the subscription price based on operating costs. Existing subscribers are not affected by new pricing during their current period; new pricing applies starting from the next renewal cycle, with at least 30 days' advance notice.",
      ],
    },

    s8: {
      h: "12. Changes to the Terms",
      body: "The Service reserves the right to revise these Terms at any time. Material changes will be notified to users with re-acceptance required.",
    },
    s9: {
      h: "13. Governing law and jurisdiction",
      body: "These Terms are governed by the laws of the Republic of China (Taiwan). Any disputes arising from the Service shall be submitted to the Taiwan Taipei District Court as the court of first instance.",
    },
    s10: { h: "14. Contact", body: "For inquiries, please email: [support@example.com]" },
  },

  ja: {
    title: "利用規約",
    lastUpdated: "最終更新:2026-05-04",
    version: "バージョン:2026-05-04-v2",
    draftWarning: "⚠ 本ページはテンプレートです。本番運用前に弁護士のレビューを受け、実際の業務に合わせて調整する必要があります。",
    s1: {
      h: "1. サービス概要",
      body: "Quiver(以下「本サービス」)は、入金・内部送金・出金機能を含む USDT(TRC-20)カストディウォレットおよびオプションの Earn 自動貸付協力ツール(Bitfinex 自動貸付連携、リファラルプログラム、Premium サブスクリプションを含む)を提供するプラットフォームです。本サービスは [会社名] が運営します。",
    },
    s2: {
      h: "2. アカウント登録と本人確認(KYC)",
      items: [
        "ユーザーは満 18 歳以上である必要があります。",
        "重要機能(送金、出金、Earn 接続)の利用前に本人確認(KYC)を完了する必要があります。",
        "他人のためのアカウント代行操作やアカウントの共有は禁止します。",
      ],
    },
    s3: {
      h: "3. セキュリティ責任",
      body: "ユーザーはログイン認証情報および二段階認証デバイスを保護する責任があります。本サービスはユーザーのパスワードや TOTP コードを能動的に尋ねることはありません。アカウントの不正利用が疑われる場合は、直ちにカスタマーサポートまでご連絡ください。",
    },
    s4: {
      h: "4. ウォレット手数料と上限",
      items: [
        "内部送金は手数料無料。",
        "出金手数料:1 件あたり 1 USDT(ネットワークガス料金により調整、変更前に通知)。",
        "最低出金額:5 USDT(手数料を下回る少額出金を避けるため)。",
        "大口出金(≥ 1,000 USD)は手動審査が必要で、1〜3 営業日かかる場合があります。",
      ],
    },
    s5: {
      h: "5. 禁止行為",
      body: "ユーザーはマネーロンダリング、詐欺、テロ資金供与、制裁リストへの違反等の行為を行ってはなりません。本サービスは必要に応じてアカウントを凍結し、所管当局に通報する権利を有します。",
    },
    s6: {
      h: "6. サービス中断と責任制限",
      body: "不可抗力(天災、戦争、ブロックチェーンのフォーク、第三者サービスの停止など)によるサービス中断について、本サービスは賠償責任を負いません。ユーザー保有の USDT は本サービスがカストディしますが、オンチェーン資産のリスク(スマートコントラクトリスク、アドレス漏洩など)は依然として存在します。",
    },
    s7: {
      h: "7. アカウント終了",
      body: "ユーザーは設定ページからいつでもアカウント削除を申請できます。本サービスは残高が 0 であることを確認した後、ソフト削除を実行します:個人データはマスクされ、アカウントは削除済みとマークされますが、取引記録は法令により 7 年間保管されます(会計法第 38 条 / 税務徴収法第 30 条)。",
    },

    sEarn: {
      h: "8. Quiver Earn サービス(Bitfinex 自動貸付連携)",
      body:
        "Earn はオプション(opt-in)機能です。ユーザーは自身が保有する Bitfinex API キー(Margin Funding の読み書き権限のみ。本サービスは Withdrawal 権限を「絶対に」要求しません)および Bitfinex Funding ウォレットの TRC-20 入金アドレスを自発的に提供します。本サービスはこれに基づき、ユーザーの Quiver 残高の USDT を自身の Bitfinex Funding ウォレットへ自動転送し、Bitfinex 上で funding offer の自動掲載・取消・更新を行います。ユーザーの資金は常に本人の KYC 済み Bitfinex アカウント内に保管され、本サービスには出金権限はなく、他のアカウントへ資金を移動することもできません。Bitfinex は独立した第三者プラットフォームであり、Bitfinex のプラットフォーム事故、停止、破綻、ポリシー変更、オンチェーンイベント等に起因する損失について、本サービスは賠償責任を負いません。ユーザーはいつでも Bitfinex 側で当該 API キーを取り消すことができ、取り消し後は本サービスはアカウントを操作できなくなります。",
    },
    sPerfFee: {
      h: "9. パフォーマンスフィー",
      items: [
        "本サービスは、Earn でユーザーが実際に得た利息収入に対してのみパフォーマンスフィーを徴収し、「元本からは決して」徴収しません。",
        "ティア別レート:Friend ティア(セルフサービス接続の先着 10 名)5%、Public ティア(それ以降のユーザー)15%、Premium サブスクリプション有効期間中 0%。Friend 枠が埋まると、新規ユーザーはすべて Public ティアで計算されます。",
        "決済サイクル:毎週月曜日 UTC 02:00 に前週(月〜日)の利息収入を集計し、その時点で適用されるレートでパフォーマンスフィーを計算し、台帳に記録します。",
        "徴収方法:上記決済後、ユーザーの Quiver メインウォレット残高から差引きます。残高不足の場合、当該フィーは ACCRUED 状態のまま次サイクルで再試行され、その間 Earn サービスは継続します。",
        "本サービスは、市場条件・規制要件等の要因に応じてティア別レートを調整する権利を留保します。重要な変更は 30 日前までに通知し、本規約への再同意を求めます。",
      ],
    },
    sReferral: {
      h: "10. リファラルプログラム",
      items: [
        "各ユーザーは 4〜12 文字 [A-Z0-9] のリファラルコードを 1 つ自由に選択できます。設定後はユーザー自身では変更できません(特殊な事情ではカスタマーサポートまでご連絡ください)。予約語(admin / quiver / support 等)および既に使用されているコードは登録できません。",
        "新規ユーザーまたはまだリファラーに紐付いていない既存ユーザーは、Earn 接続時またはリファラルページで他人のリファラルコードを入力してリファラル関係を確立できます。各ユーザーは 1 名のリファラーにのみ紐付けでき、紐付け後は変更不可。自己リファラルや循環リファラルはシステムが自動的に検出してブロックします。",
        "レベニューシェア比率:被リファラル者(以下「下位」)がパフォーマンスフィーを徴収されるたびに、直接リファラー(L1)はそのフィーの 10%、L2 リファラー(リファラーのリファラー)は 5% を受け取ります。本サービスは 85%(両レベルが有効な場合)を保持します。",
        "レベニューシェア期間:6 ヶ月。下位の「最初」のパフォーマンスフィー決済日から起算。期間終了後はレベニューシェアは発生しません。",
        "支払い方法:リアルタイム — パフォーマンスフィー決済時にレベニューシェアが自動的にリファラーの Quiver メインウォレットに振り込まれ、別途請求は不要です。最低支払額は 0.01 USDT、それ未満の額は切り捨てられます。",
        "リファラルコードは本人による合法的な使用のみに限られます。詐欺・ボット・自動化・その他不正な手段による下位生成は禁止。違反者に対し、本サービスは支払済みレベニューシェアの返還請求、リファラル資格停止、アカウント終了の権利を有します。",
      ],
    },
    sPremium: {
      h: "11. Premium サブスクリプション",
      items: [
        "Premium 月額 9.99 USDT。サブスクリプション有効期間中、ユーザーの Earn パフォーマンスフィーは 0%(第 9 条のティア別レートを置き換え)。",
        "請求方法:サブスク登録時に初月費用を Quiver メインウォレットから即時引落。以降は 30 日ごとに自動更新・引落します。",
        "キャンセルポリシー:Premium ページでいつでもキャンセル可能。キャンセル後も当期終了まで 0% パフォーマンスフィーが適用され、期末で失効、その後フィーは Friend / Public ティア別レートに戻ります。既に支払った費用は返金不可。当期終了前であればいつでもキャンセルを取消(再開)できます。",
        "残高不足:自動更新時に Quiver メインウォレット残高が不足する場合、サブスクリプションは PAST_DUE 状態となり 7 日間の猶予期間に入ります。猶予期間中も 0% パフォーマンスフィーが適用され、システムは毎日請求を再試行します。猶予期間中に請求が成功しない場合、サブスクリプションは自動的に EXPIRED となり、フィーは標準ティアに戻ります。ユーザーはページからいつでも再登録可能。",
        "サブスクリプション費用はリファラルレベニューシェアの対象外です(リファラーはサブスク支払いから報酬を得ません)。",
        "本サービスは運営コストに応じてサブスク価格を調整する権利を留保します。既存のサブスク利用者は現サイクル中は新価格の影響を受けず、新価格は次回更新サイクルから適用され、30 日前までに通知します。",
      ],
    },

    s8: {
      h: "12. 規約の変更",
      body: "本サービスはいつでも本規約を改定する権利を留保します。重要な変更はユーザーに通知し、再同意を求めます。",
    },
    s9: {
      h: "13. 準拠法および管轄",
      body: "本規約は中華民国(台湾)法に準拠します。本サービスに関する紛争は、台湾台北地方裁判所を第一審管轄裁判所とすることに合意します。",
    },
    s10: { h: "14. お問い合わせ", body: "ご質問は次のアドレスまでお寄せください:[support@example.com]" },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

function ListSection({ section }: { section: SectionList }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{section.h}</h2>
      <ul className="mt-3 list-inside list-disc space-y-1.5">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function BodySection({ section }: { section: SectionBody }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{section.h}</h2>
      <p className="mt-3">{section.body}</p>
    </section>
  );
}

export default function TermsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];
  return (
    <article className="mx-auto max-w-3xl py-12 leading-relaxed text-slate-700 dark:text-slate-200">
      <h1 className="text-3xl font-bold">{s.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {s.lastUpdated} · {s.version}
      </p>

      <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        {s.draftWarning}
      </p>

      <BodySection section={s.s1} />
      <ListSection section={s.s2} />
      <BodySection section={s.s3} />
      <ListSection section={s.s4} />
      <BodySection section={s.s5} />
      <BodySection section={s.s6} />
      <BodySection section={s.s7} />

      {/* F-4d: Earn / fees / referral / premium clauses (8-11) */}
      <BodySection section={s.sEarn} />
      <ListSection section={s.sPerfFee} />
      <ListSection section={s.sReferral} />
      <ListSection section={s.sPremium} />

      {/* Meta clauses (12-14) */}
      <BodySection section={s.s8} />
      <BodySection section={s.s9} />
      <BodySection section={s.s10} />
    </article>
  );
}
