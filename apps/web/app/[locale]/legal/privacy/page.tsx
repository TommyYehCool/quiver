/**
 * 隱私政策(範本) — phase 6E-5
 *
 * ⚠ 此為佔位範本。上線前必須給律師 review,並依台灣個資法施行細則調整。
 */

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<Locale, {
  title: string;
  lastUpdated: string;
  version: string;
  draftWarning: string;
  s1: { h: string; account: { strong: string; body: string }; kyc: { strong: string; body: string }; tx: { strong: string; body: string }; device: { strong: string; body: string } };
  s2: { h: string; items: string[] };
  s3: { h: string; items: string[] };
  s4: { h: string; body: string };
  s5: { h: string; lead: string; items: string[] };
  s6: { h: string; lead: string; items: string[] };
  s7: { h: string; body: string };
  s8: { h: string; items: string[] };
  s9: { h: string; body: string };
  s10: { h: string; body: string };
}> = {
  "zh-TW": {
    title: "隱私政策",
    lastUpdated: "最後更新：2026-04-30",
    version: "版本：2026-04-30-v1",
    draftWarning: "⚠ 本頁為範本，正式上線前需請律師 review 並依台灣個資法施行細則調整。",
    s1: {
      h: "1. 我們收集的資料",
      account: { strong: "帳戶資料:", body: "email、Google 顯示名稱、頭像 URL、語系偏好。" },
      kyc: { strong: "KYC 資料:", body: "姓名、身分證號、出生日期、國籍、身分證正反面照片、自拍照。僅用於合規驗證,不對外揭露。" },
      tx: { strong: "交易資料:", body: "入金 / 內轉 / 提領紀錄(金額、時間、相關地址 / 交易雜湊)。" },
      device: { strong: "登入裝置:", body: "IP 位址、User-Agent、登入時間。用於帳戶安全監控。" },
    },
    s2: {
      h: "2. 我們不收集的資料",
      items: [
        "密碼(本服務透過 Google OAuth 登入，不接觸你的 Google 密碼)。",
        "銀行帳戶 / 信用卡(本服務不接受法幣支付)。",
        "你錢包的私鑰(由本服務代管,使用者不直接接觸)。",
      ],
    },
    s3: {
      h: "3. 資料使用目的",
      items: [
        "提供服務：帳戶管理、交易執行、客服支援。",
        "合規義務：KYC / AML / 洗錢防制 / 稅務申報協助。",
        "安全防護：異常交易偵測、帳戶冒用偵測。",
        "系統改善：聚合層級的使用統計(無個人識別)。",
      ],
    },
    s4: {
      h: "4. 資料保存期限",
      body: "交易紀錄依法保留 7 年(會計法 / 稅捐稽徵法)。\nKYC 資料自帳戶終止後保留 5 年(洗錢防制法第 7 條)。\n其他個資於目的消滅後刪除。",
    },
    s5: {
      h: "5. 資料分享",
      lead: "本服務不販售用戶個資。下列情況例外可能分享:",
      items: [
        "司法機關依法調閱。",
        "合作的合規服務商(僅必要範圍)。",
        "使用者明確同意的其他情況。",
      ],
    },
    s6: {
      h: "6. 你的權利",
      lead: "依個資法第 3 條,你有權：",
      items: [
        "查詢、閱覽你的個資：請至設定頁「匯出我的資料」。",
        "更正錯誤個資：來信客服。",
        "請求刪除帳戶：設定頁「刪除帳號」(需餘額為 0)。",
        "限制處理目的：來信客服。",
      ],
    },
    s7: {
      h: "7. Cookie 與追蹤",
      body: "本服務僅使用必要 cookie(登入 session)。\n不使用第三方追蹤、廣告 cookie。",
    },
    s8: {
      h: "8. 資料安全",
      items: [
        "所有 API 強制 HTTPS。",
        "資料庫加密(at-rest + in-transit)。",
        "master seed / 私鑰用 envelope encryption(KEK + DEK)。",
        "定期備份 + 災難復原演練。",
      ],
    },
    s9: { h: "9. 政策變更", body: "本政策變更會通知用戶並要求重新接受。" },
    s10: { h: "10. 聯絡方式", body: "個資相關問題,請來信:[privacy@example.com]" },
  },
  en: {
    title: "Privacy Policy",
    lastUpdated: "Last updated: 2026-04-30",
    version: "Version: 2026-04-30-v1",
    draftWarning: "⚠ This page is a template. It must be reviewed by legal counsel and adjusted to local data-protection regulations before production launch.",
    s1: {
      h: "1. Information we collect",
      account: { strong: "Account data:", body: "email, Google display name, avatar URL, language preference." },
      kyc: { strong: "KYC data:", body: "name, government ID number, date of birth, nationality, ID card photos (front/back), and selfie. Used solely for compliance verification and never disclosed externally." },
      tx: { strong: "Transaction data:", body: "deposit / internal transfer / withdrawal records (amount, time, related addresses / transaction hashes)." },
      device: { strong: "Login device:", body: "IP address, User-Agent, and login time. Used for account security monitoring." },
    },
    s2: {
      h: "2. Information we do not collect",
      items: [
        "Passwords (this service uses Google OAuth and never sees your Google password).",
        "Bank accounts / credit cards (we do not accept fiat payments).",
        "Wallet private keys (custodied by this service; users do not handle them directly).",
      ],
    },
    s3: {
      h: "3. Purposes of data use",
      items: [
        "Service delivery: account management, transaction execution, customer support.",
        "Compliance obligations: KYC / AML / anti-money-laundering / tax reporting assistance.",
        "Security: anomaly detection and account-takeover prevention.",
        "Product improvement: aggregated usage statistics (no personal identifiers).",
      ],
    },
    s4: {
      h: "4. Data retention",
      body: "Transaction records are retained for 7 years as required by law (Accounting Act / Tax Collection Act). KYC data is retained for 5 years after account termination (Anti-Money-Laundering Act Article 7). Other personal data is deleted once its purpose is fulfilled.",
    },
    s5: {
      h: "5. Data sharing",
      lead: "We do not sell user data. The following exceptions may apply:",
      items: [
        "Lawful disclosure requests from judicial authorities.",
        "Partnered compliance service providers (limited to necessary scope).",
        "Other situations with the user's explicit consent.",
      ],
    },
    s6: {
      h: "6. Your rights",
      lead: "Under Article 3 of the Personal Data Protection Act, you have the right to:",
      items: [
        "View and access your personal data — go to Settings → Export My Data.",
        "Correct inaccurate data — contact customer support.",
        "Request account deletion — Settings → Delete Account (balance must be 0).",
        "Restrict the purpose of processing — contact customer support.",
      ],
    },
    s7: {
      h: "7. Cookies and tracking",
      body: "We only use necessary cookies (login session). We do not use third-party tracking or advertising cookies.",
    },
    s8: {
      h: "8. Data security",
      items: [
        "All APIs are HTTPS-only.",
        "Database encryption (at-rest + in-transit).",
        "Master seed / private keys use envelope encryption (KEK + DEK).",
        "Regular backups + disaster-recovery drills.",
      ],
    },
    s9: { h: "9. Policy updates", body: "We will notify users of policy changes and require re-acceptance." },
    s10: { h: "10. Contact", body: "For privacy-related questions, please email: [privacy@example.com]" },
  },
  ja: {
    title: "プライバシーポリシー",
    lastUpdated: "最終更新:2026-04-30",
    version: "バージョン:2026-04-30-v1",
    draftWarning: "⚠ 本ページはテンプレートです。本番運用前に弁護士のレビューを受け、各国の個人情報保護法令に準拠して調整する必要があります。",
    s1: {
      h: "1. 収集する情報",
      account: { strong: "アカウント情報:", body: "メールアドレス、Google 表示名、アバター URL、言語設定。" },
      kyc: { strong: "KYC 情報:", body: "氏名、身分証番号、生年月日、国籍、身分証の表裏画像、自撮り画像。コンプライアンス検証のみに使用し、外部には開示しません。" },
      tx: { strong: "取引情報:", body: "入金 / 内部送金 / 出金履歴(金額、時刻、関連アドレス / トランザクションハッシュ)。" },
      device: { strong: "ログインデバイス:", body: "IP アドレス、User-Agent、ログイン時刻。アカウントのセキュリティ監視に使用します。" },
    },
    s2: {
      h: "2. 収集しない情報",
      items: [
        "パスワード(本サービスは Google OAuth でログインするため、Google パスワードに触れません)。",
        "銀行口座 / クレジットカード(本サービスは法定通貨決済を受け付けません)。",
        "ウォレットの秘密鍵(本サービスがカストディし、ユーザーが直接触れることはありません)。",
      ],
    },
    s3: {
      h: "3. データの利用目的",
      items: [
        "サービス提供:アカウント管理、取引実行、カスタマーサポート。",
        "コンプライアンス義務:KYC / AML / マネーロンダリング防止 / 税務申告支援。",
        "セキュリティ:異常取引の検知、アカウント乗っ取り対策。",
        "サービス改善:集計レベルの利用統計(個人識別なし)。",
      ],
    },
    s4: {
      h: "4. データ保管期間",
      body: "取引記録は法令に基づき 7 年間保管します(会計法 / 税務徴収法)。KYC 情報はアカウント終了後 5 年間保管します(マネーロンダリング防止法第 7 条)。その他の個人情報は目的達成後に削除します。",
    },
    s5: {
      h: "5. データの共有",
      lead: "本サービスはユーザー個人情報を販売しません。以下の場合に限り共有することがあります:",
      items: [
        "司法機関による法令に基づく開示請求。",
        "提携するコンプライアンスサービス事業者(必要範囲のみ)。",
        "ユーザーが明示的に同意したその他の場合。",
      ],
    },
    s6: {
      h: "6. ユーザーの権利",
      lead: "個人情報保護法第 3 条に基づき、以下の権利があります:",
      items: [
        "個人データの閲覧 — 設定ページの「データをエクスポート」へ。",
        "誤った個人データの訂正 — カスタマーサポートまでご連絡ください。",
        "アカウント削除のリクエスト — 設定ページの「アカウント削除」(残高は 0 である必要があります)。",
        "処理目的の制限 — カスタマーサポートまでご連絡ください。",
      ],
    },
    s7: {
      h: "7. Cookie とトラッキング",
      body: "本サービスは必要な Cookie(ログインセッション)のみを使用します。サードパーティのトラッキング Cookie や広告 Cookie は使用しません。",
    },
    s8: {
      h: "8. データセキュリティ",
      items: [
        "すべての API は HTTPS 必須。",
        "データベース暗号化(保存時 + 通信時)。",
        "マスターシード / 秘密鍵は envelope encryption(KEK + DEK)を使用。",
        "定期バックアップ + 災害復旧訓練。",
      ],
    },
    s9: { h: "9. ポリシー変更", body: "本ポリシーの変更時はユーザーに通知し、再同意を求めます。" },
    s10: { h: "10. お問い合わせ", body: "個人情報に関するお問い合わせ:[privacy@example.com]" },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
}

export default function PrivacyPage({
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

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s1.h}</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>
            <strong>{s.s1.account.strong}</strong>{s.s1.account.body}
          </li>
          <li>
            <strong>{s.s1.kyc.strong}</strong>{s.s1.kyc.body}
          </li>
          <li>
            <strong>{s.s1.tx.strong}</strong>{s.s1.tx.body}
          </li>
          <li>
            <strong>{s.s1.device.strong}</strong>{s.s1.device.body}
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s2.h}</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s2.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s3.h}</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s3.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s4.h}</h2>
        <p className="mt-3 whitespace-pre-line">{s.s4.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s5.h}</h2>
        <p className="mt-3">{s.s5.lead}</p>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s5.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s6.h}</h2>
        <p className="mt-3">{s.s6.lead}</p>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s6.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s7.h}</h2>
        <p className="mt-3 whitespace-pre-line">{s.s7.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s8.h}</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s8.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s9.h}</h2>
        <p className="mt-3">{s.s9.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s10.h}</h2>
        <p className="mt-3">{s.s10.body}</p>
      </section>
    </article>
  );
}
