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
