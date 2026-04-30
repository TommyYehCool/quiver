"""偵測 ngrok 當前 public URL。

ngrok 容器在 :4040 暴露 local API,從 docker network 內可呼叫:
  GET http://ngrok:4040/api/tunnels
回傳所有 active tunnels,挑 https 那條的 public_url。
"""

from __future__ import annotations

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

NGROK_API = "http://ngrok:4040/api/tunnels"


async def get_public_url() -> str | None:
    """回傳 ngrok 當前 https public URL,沒 ngrok 或抓不到回 None。"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(NGROK_API)
    except httpx.HTTPError as e:
        logger.warning("ngrok_local_api_unreachable", error=str(e))
        return None

    if res.status_code >= 400:
        logger.warning("ngrok_local_api_error", status=res.status_code)
        return None

    body = res.json()
    for tunnel in body.get("tunnels", []):
        url = tunnel.get("public_url", "")
        if url.startswith("https://"):
            return url  # type: ignore[no-any-return]

    logger.warning("ngrok_no_https_tunnel", body=body)
    return None
