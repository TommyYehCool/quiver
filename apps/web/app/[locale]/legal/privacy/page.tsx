/**
 * 隱私政策(範本) — phase 6E-5
 *
 * ⚠ 此為佔位範本。上線前必須給律師 review,並依台灣個資法施行細則調整。
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl py-12 leading-relaxed text-slate-700 dark:text-slate-200">
      <h1 className="text-3xl font-bold">隱私政策</h1>
      <p className="mt-2 text-sm text-slate-500">
        最後更新:2026-04-30 · 版本:2026-04-30-v1
      </p>

      <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        ⚠ 本頁為範本,正式上線前需請律師 review 並依台灣個資法施行細則調整。
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">1. 我們收集的資料</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>
            <strong>帳戶資料:</strong>email、Google 顯示名稱、頭像 URL、語系偏好。
          </li>
          <li>
            <strong>KYC 資料:</strong>姓名、身分證號、出生日期、國籍、身分證正反面照片、自拍照。
            僅用於合規驗證,不對外揭露。
          </li>
          <li>
            <strong>交易資料:</strong>入金 / 內轉 / 提領紀錄(金額、時間、相關地址 / 交易雜湊)。
          </li>
          <li>
            <strong>登入裝置:</strong>IP 位址、User-Agent、登入時間。用於帳戶安全監控。
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">2. 我們不收集的資料</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>密碼(本服務透過 Google OAuth 登入,不接觸你的 Google 密碼)。</li>
          <li>銀行帳戶 / 信用卡(本服務不接受法幣支付)。</li>
          <li>你錢包的私鑰(由本服務代管,使用者不直接接觸)。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">3. 資料使用目的</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>提供服務:帳戶管理、交易執行、客服支援。</li>
          <li>合規義務:KYC / AML / 洗錢防制 / 稅務申報協助。</li>
          <li>安全防護:異常交易偵測、帳戶冒用偵測。</li>
          <li>系統改善:聚合層級的使用統計(無個人識別)。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">4. 資料保存期限</h2>
        <p className="mt-3">
          交易紀錄依法保留 [N] 年(會計法 / 稅捐稽徵法)。KYC 資料自帳戶終止後保留
          [N] 年。其他個資於目的消滅後刪除。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">5. 資料分享</h2>
        <p className="mt-3">本服務不販售用戶個資。下列情況例外可能分享:</p>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>司法機關依法調閱。</li>
          <li>合作的合規服務商(僅必要範圍)。</li>
          <li>使用者明確同意的其他情況。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">6. 你的權利</h2>
        <p className="mt-3">依個資法第 3 條,你有權:</p>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>查詢、閱覽你的個資 — 請至設定頁「匯出我的資料」。</li>
          <li>更正錯誤個資 — 來信客服。</li>
          <li>請求刪除帳戶 — 設定頁「刪除帳號」(需餘額為 0)。</li>
          <li>限制處理目的 — 來信客服。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">7. Cookie 與追蹤</h2>
        <p className="mt-3">
          本服務僅使用必要 cookie(登入 session)。不使用第三方追蹤、廣告 cookie。
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">8. 資料安全</h2>
        <ul className="mt-3 list-inside list-disc space-y-1">
          <li>所有 API 強制 HTTPS。</li>
          <li>資料庫加密(at-rest + in-transit)。</li>
          <li>master seed / 私鑰用 envelope encryption(KEK + DEK)。</li>
          <li>定期備份 + 災難復原演練。</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">9. 政策變更</h2>
        <p className="mt-3">本政策變更會通知用戶並要求重新接受。</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">10. 聯絡方式</h2>
        <p className="mt-3">
          個資相關問題,請來信:[privacy@example.com]
        </p>
      </section>
    </article>
  );
}
