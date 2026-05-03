/**
 * 服務條款(範本) — phase 6E-5
 *
 * ⚠ 此為佔位範本。上線前必須給律師 review,並依台灣金管會 / 個資法 / 洗錢防制法
 *   實際業務需要調整。
 *
 * 注意:本頁手續費 / 門檻數字必須跟後端 settings 一致(`.env` 的 WITHDRAWAL_FEE_USDT
 * / WITHDRAWAL_LARGE_THRESHOLD_USD / MIN_WITHDRAWAL_USDT)。改任何數字都要同步:
 *   1. 改 `.env` 那邊的值
 *   2. 改本頁的數字
 *   3. bump 後端 `TOS_CURRENT_VERSION`(account.py),強迫用戶重新同意
 */

type Locale = "zh-TW" | "en" | "ja";

const STRINGS: Record<Locale, {
  title: string;
  lastUpdated: string;
  version: string;
  draftWarning: string;
  s1: { h: string; body: string };
  s2: { h: string; items: string[] };
  s3: { h: string; body: string };
  s4: { h: string; items: string[] };
  s5: { h: string; body: string };
  s6: { h: string; body: string };
  s7: { h: string; body: string };
  s8: { h: string; body: string };
  s9: { h: string; body: string };
  s10: { h: string; body: string };
}> = {
  "zh-TW": {
    title: "服務條款",
    lastUpdated: "最後更新:2026-04-30",
    version: "版本:2026-04-30-v1",
    draftWarning: "⚠ 本頁為範本,正式上線前需請律師 review 並依實際業務調整。",
    s1: {
      h: "1. 服務說明",
      body: "Quiver(以下稱「本服務」)為一個提供 USDT(TRC-20)託管錢包服務的平台,包含入金、內部轉帳、提領功能。本服務由 [公司名稱] 經營。",
    },
    s2: {
      h: "2. 帳戶註冊與身分驗證(KYC)",
      items: [
        "使用者須滿 18 歲。",
        "須完成身分驗證(KYC)後方可使用敏感功能(轉帳、提領)。",
        "禁止為他人代操、共用帳戶。",
      ],
    },
    s3: {
      h: "3. 安全責任",
      body: "使用者有責任保護其登入憑證、二次驗證裝置。本服務不會主動詢問用戶密碼或 TOTP 驗證碼。如懷疑帳戶遭未授權使用,請立即聯絡客服。",
    },
    s4: {
      h: "4. 手續費與限額",
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
    s8: {
      h: "8. 條款變更",
      body: "本服務保留隨時修訂本條款的權利。重大變更會通知使用者並要求重新接受。",
    },
    s9: {
      h: "9. 準據法與管轄",
      body: "本條款適用中華民國法律。因本服務所生爭議,雙方合意以台灣台北地方法院為第一審管轄法院。",
    },
    s10: { h: "10. 聯絡方式", body: "如有疑問,請來信:[support@example.com]" },
  },
  en: {
    title: "Terms of Service",
    lastUpdated: "Last updated: 2026-04-30",
    version: "Version: 2026-04-30-v1",
    draftWarning: "⚠ This page is a template. It must be reviewed by legal counsel and adjusted to actual business operations before production launch.",
    s1: {
      h: "1. Service description",
      body: "Quiver (the \"Service\") is a platform providing custodial wallet services for USDT (TRC-20), including deposits, internal transfers, and withdrawals. The Service is operated by [Company Name].",
    },
    s2: {
      h: "2. Account registration and identity verification (KYC)",
      items: [
        "Users must be at least 18 years old.",
        "Identity verification (KYC) must be completed before using sensitive features (transfers, withdrawals).",
        "Operating accounts on behalf of others or sharing accounts is prohibited.",
      ],
    },
    s3: {
      h: "3. Security responsibility",
      body: "Users are responsible for protecting their login credentials and 2FA devices. The Service will never proactively ask for your password or TOTP code. If you suspect unauthorized access, contact customer support immediately.",
    },
    s4: {
      h: "4. Fees and limits",
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
    s8: {
      h: "8. Changes to the Terms",
      body: "The Service reserves the right to revise these Terms at any time. Material changes will be notified to users with re-acceptance required.",
    },
    s9: {
      h: "9. Governing law and jurisdiction",
      body: "These Terms are governed by the laws of the Republic of China (Taiwan). Any disputes arising from the Service shall be submitted to the Taiwan Taipei District Court as the court of first instance.",
    },
    s10: { h: "10. Contact", body: "For inquiries, please email: [support@example.com]" },
  },
  ja: {
    title: "利用規約",
    lastUpdated: "最終更新:2026-04-30",
    version: "バージョン:2026-04-30-v1",
    draftWarning: "⚠ 本ページはテンプレートです。本番運用前に弁護士のレビューを受け、実際の業務に合わせて調整する必要があります。",
    s1: {
      h: "1. サービス概要",
      body: "Quiver(以下「本サービス」)は、入金・内部送金・出金機能を含む USDT(TRC-20)カストディウォレットを提供するプラットフォームです。本サービスは [会社名] が運営します。",
    },
    s2: {
      h: "2. アカウント登録と本人確認(KYC)",
      items: [
        "ユーザーは満 18 歳以上である必要があります。",
        "重要機能(送金、出金)の利用前に本人確認(KYC)を完了する必要があります。",
        "他人のためのアカウント代行操作やアカウントの共有は禁止します。",
      ],
    },
    s3: {
      h: "3. セキュリティ責任",
      body: "ユーザーはログイン認証情報および二段階認証デバイスを保護する責任があります。本サービスはユーザーのパスワードや TOTP コードを能動的に尋ねることはありません。アカウントの不正利用が疑われる場合は、直ちにカスタマーサポートまでご連絡ください。",
    },
    s4: {
      h: "4. 手数料と上限",
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
    s8: {
      h: "8. 規約の変更",
      body: "本サービスはいつでも本規約を改定する権利を留保します。重要な変更はユーザーに通知し、再同意を求めます。",
    },
    s9: {
      h: "9. 準拠法および管轄",
      body: "本規約は中華民国(台湾)法に準拠します。本サービスに関する紛争は、台湾台北地方裁判所を第一審管轄裁判所とすることに合意します。",
    },
    s10: { h: "10. お問い合わせ", body: "ご質問は次のアドレスまでお寄せください:[support@example.com]" },
  },
};

function pickLocale(l: string): Locale {
  if (l === "en" || l === "ja") return l;
  return "zh-TW";
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

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s1.h}</h2>
        <p className="mt-3">{s.s1.body}</p>
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
        <p className="mt-3">{s.s3.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s4.h}</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {s.s4.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s5.h}</h2>
        <p className="mt-3">{s.s5.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s6.h}</h2>
        <p className="mt-3">{s.s6.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s7.h}</h2>
        <p className="mt-3">{s.s7.body}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{s.s8.h}</h2>
        <p className="mt-3">{s.s8.body}</p>
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
