"""KYC 檔案儲存 — 寫入 docker volume `/app/uploads/kyc/`。

路徑：`{submission_id}/{kind}_{uuid}.{ext}`，相對於 UPLOAD_BASE_DIR 的相對路徑會
寫進 DB（`id_front_url` 等欄位）。讀取時透過 `read_file` 回傳 bytes。
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Final, Literal

from fastapi import HTTPException, UploadFile, status

UPLOAD_BASE_DIR: Final[Path] = Path("/app/uploads/kyc")
MAX_FILE_SIZE: Final[int] = 5 * 1024 * 1024  # 5 MB

KycFileKind = Literal["id_front", "id_back", "selfie", "proof_of_address"]

# magic bytes → 副檔名
_MAGIC_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
)


def _detect_extension(head: bytes) -> str | None:
    for sig, ext in _MAGIC_SIGNATURES:
        if head.startswith(sig):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


async def save_kyc_upload(
    submission_id: int,
    kind: KycFileKind,
    upload: UploadFile,
) -> str:
    """寫入檔案，回傳相對於 UPLOAD_BASE_DIR 的相對路徑（存進 DB）。

    驗證：大小 ≤ 5MB、格式 ∈ {jpg, png, webp}（看 magic bytes 不信 client header）。
    """
    raw = await upload.read()
    if len(raw) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "kyc.fileEmpty", "params": {"kind": kind}},
        )
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "kyc.fileTooLarge",
                "params": {"kind": kind, "maxBytes": MAX_FILE_SIZE},
            },
        )

    ext = _detect_extension(raw[:16])
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "kyc.fileFormatUnsupported", "params": {"kind": kind}},
        )

    submission_dir = UPLOAD_BASE_DIR / str(submission_id)
    submission_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{kind}_{uuid.uuid4().hex}.{ext}"
    abs_path = submission_dir / filename
    abs_path.write_bytes(raw)

    return f"{submission_id}/{filename}"


def resolve_path(rel_path: str) -> Path:
    """把存在 DB 的相對路徑轉成絕對路徑，並擋路徑穿越。"""
    abs_path = (UPLOAD_BASE_DIR / rel_path).resolve()
    base = UPLOAD_BASE_DIR.resolve()
    if not str(abs_path).startswith(str(base) + "/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "kyc.invalidPath"},
        )
    if not abs_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "kyc.fileNotFound"},
        )
    return abs_path


def media_type_for(rel_path: str) -> str:
    ext = rel_path.rsplit(".", 1)[-1].lower()
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")
