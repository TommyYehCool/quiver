/**
 * 服務條款(範本) — phase 6E-5
 *
 * ⚠ 此為佔位範本。上線前必須給律師 review,並依台灣金管會 / 個資法 / 洗錢防制法
 *   實際業務需要調整。
 */
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl py-12 leading-relaxed text-slate-700 dark:text-slate-200">
      <h1 className="text-3xl font-bold">服務條款</h1>
      <p className="mt-2 text-sm text-slate-500">
        最後更新:2026-04-30 · 版本:2026-04-30-v1
      </p>

      <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        ⚠ 本頁為範本,正式上線前需請律師 review 並依實際業務調整。
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">1. 服務說明</h2>
        <p className="mt-3">
          Quiver(以下稱「本服務」)為一個提供 USDT(TRC-20)託管錢包服務的平台,
          包含入金、內部轉帳、提領功能。本服務由 [公司名稱] 經營。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">2. 帳戶註冊與身分驗證(KYC)</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>使用者須滿 18 歲。</li>
          <li>須完成身分驗證(KYC)後方可使用敏感功能(轉帳、提領)。</li>
          <li>禁止為他人代操、共用帳戶。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">3. 安全責任</h2>
        <p className="mt-3">
          使用者有責任保護其登入憑證、二次驗證裝置。本服務不會主動詢問用戶密碼或
          TOTP 驗證碼。如懷疑帳戶遭未授權使用,請立即聯絡客服。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">4. 手續費</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>內部轉帳免手續費。</li>
          <li>提領手續費:每筆 [X] USDT(隨網路 gas 費用調整)。</li>
          <li>大額提領(≥ [X] USD)需經人工審核,可能需 1-3 個工作日。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">5. 禁止行為</h2>
        <p className="mt-3">
          使用者不得從事洗錢、詐欺、資助恐怖主義、違反制裁名單等行為。本服務有
          權於必要時凍結帳戶並通報主管機關。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">6. 服務中斷與責任限制</h2>
        <p className="mt-3">
          因不可抗力(天災、戰爭、區塊鏈分叉、第三方服務商中斷等)導致的服務中斷,
          本服務不承擔賠償責任。使用者持有的 USDT 由本服務以託管型態保管,但鏈上
          資產風險仍存在(智能合約風險、地址洩漏等)。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">7. 帳戶終止</h2>
        <p className="mt-3">
          使用者可隨時於設定頁申請刪除帳戶。本服務於確認餘額為 0 後執行
          soft delete:個人資料遮罩、帳戶標記為已刪除,但交易紀錄依法保留
          [N] 年(會計法第 38 條 / 稅捐稽徵法第 30 條)。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">8. 條款變更</h2>
        <p className="mt-3">
          本服務保留隨時修訂本條款的權利。重大變更會通知使用者並要求重新接受。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">9. 準據法與管轄</h2>
        <p className="mt-3">
          本條款適用中華民國法律。因本服務所生爭議,雙方合意以台灣台北地方法院
          為第一審管轄法院。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">10. 聯絡方式</h2>
        <p className="mt-3">
          如有疑問,請來信:[support@example.com]
        </p>
      </section>
    </article>
  );
}
