"""Email service — 透過 Resend 寄送通知。

API key 沒設時(`RESEND_API_KEY` 為空)會 log warning 並 no-op,讓開發環境不依賴外部服務。
"""

from __future__ import annotations

from typing import Final

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_RESEND_ENDPOINT: Final[str] = "https://api.resend.com/emails"


async def _send(to: str, subject: str, html: str) -> bool:
    api_key = settings.resend_api_key.get_secret_value()
    if not api_key:
        logger.warning("resend_skipped_no_api_key", to=_mask(to), subject=subject)
        return False

    payload = {
        "from": settings.resend_from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(_RESEND_ENDPOINT, json=payload, headers=headers)
        if res.status_code >= 400:
            logger.error(
                "resend_failed",
                status=res.status_code,
                body=res.text[:500],
                to=_mask(to),
            )
            return False
    except httpx.HTTPError as e:
        logger.error("resend_http_error", error=str(e), to=_mask(to))
        return False

    logger.info("resend_sent", to=_mask(to), subject=subject)
    return True


async def send_kyc_approved(to: str, display_name: str | None) -> bool:
    name = display_name or to
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
      <h2>KYC 審核通過</h2>
      <p>{name},您好:</p>
      <p>您的身分驗證已通過審核,現在可以開始使用 Quiver 全部功能。</p>
      <p style="margin-top:24px">
        <a href="{settings.frontend_base_url}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          回到 Quiver
        </a>
      </p>
    </div>
    """
    return await _send(to, "[Quiver] KYC 審核已通過", html)


async def send_transfer_received(
    to: str,
    *,
    sender_email: str,
    sender_display_name: str | None,
    amount: str,
    currency: str,
    note: str | None,
) -> bool:
    sender_label = sender_display_name or sender_email
    note_block = (
        f'<p style="background:#f1f5f9;border-radius:8px;padding:10px 14px;color:#334155">'
        f"備註:{note}</p>"
        if note
        else ""
    )
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
      <h2>你收到一筆轉帳 💰</h2>
      <p style="font-size:32px;font-weight:600;color:#10b981;margin:8px 0">
        +{amount} <span style="font-size:14px;color:#64748b">{currency}</span>
      </p>
      <p>來自 <strong>{sender_label}</strong>(<span style="color:#64748b">{sender_email}</span>)</p>
      {note_block}
      <p style="margin-top:24px">
        <a href="{settings.frontend_base_url}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          打開 Quiver
        </a>
      </p>
    </div>
    """
    return await _send(to, f"[Quiver] 收到 {amount} {currency}", html)


async def send_reconciliation_digest(
    to_emails: list[str],
    *,
    flagged_rows: list[dict[str, str]],  # 已 stringify
    total_users: int,
    error_count: int,
) -> bool:
    """寄對帳告警給 admin。"""
    if not to_emails:
        return False

    rows_html = "".join(
        f"<tr>"
        f"<td style='padding:6px 10px;border:1px solid #e2e8f0'>{r['email']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px'>{r['address']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e2e8f0;text-align:right'>{r['ledger']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e2e8f0;text-align:right'>{r['chain']}</td>"
        f"<td style='padding:6px 10px;border:1px solid #e2e8f0;text-align:right;color:{'#dc2626' if float(r['diff']) > 0 else '#7c3aed'}'>"
        f"{r['diff']}</td>"
        f"</tr>"
        for r in flagged_rows
    )
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:760px;margin:auto">
      <h2>每日對帳告警 — {len(flagged_rows)} 筆需要關注</h2>
      <p>
        共掃 {total_users} 個 user,差異 > 0.01 USDT 的有 {len(flagged_rows)} 個,
        Tatum 拉取失敗 {error_count} 個。
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead style="background:#f1f5f9">
          <tr>
            <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Email</th>
            <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Address</th>
            <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Ledger</th>
            <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Chain</th>
            <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Chain − Ledger</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:16px">
        Phase 6A 注意:目前架構下,部分 diff 是合理的(內部轉帳、提領手續費 USDT、in-flight 提領、PROVISIONAL 入金)。
        Phase 6 加 sweep + 細分 ledger 後 diff 應自然歸零。
      </p>
    </div>
    """
    # 一次寄給所有 admin
    success = True
    for to in to_emails:
        ok = await _send(to, f"[Quiver] 每日對帳 — {len(flagged_rows)} 筆告警", html)
        success = success and ok
    return success


async def send_kyc_rejected(to: str, display_name: str | None, reason: str) -> bool:
    name = display_name or to
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
      <h2>KYC 審核未通過</h2>
      <p>{name},您好:</p>
      <p>很抱歉,您的身分驗證未通過審核,原因如下:</p>
      <blockquote style="border-left:3px solid #ef4444;padding-left:12px;color:#475569">
        {reason}
      </blockquote>
      <p>您可以重新提交 KYC 資料。</p>
      <p style="margin-top:24px">
        <a href="{settings.frontend_base_url}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          回到 Quiver
        </a>
      </p>
    </div>
    """
    return await _send(to, "[Quiver] KYC 審核未通過", html)


def _mask(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[:2]}***@{domain}"
