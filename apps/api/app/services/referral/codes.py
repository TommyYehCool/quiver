"""Referral code set + lookup — F-4b.

Codes are user-chosen, uppercase-normalized, 4-12 [A-Z0-9], unique. Once
set, the user cannot change their own code (admin can update directly via
SQL or future admin endpoint — no user-facing PATCH).
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.referral import ReferralCode
from app.services.referral import policy, repo

logger = get_logger(__name__)


class CodeError(Exception):
    """Raised when code validation / set fails. .code holds an i18n key."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


async def set_code_for_user(
    db: AsyncSession, *, user_id: int, raw_code: str
) -> ReferralCode:
    """Set the user's referral code for the first time. Raises CodeError
    with .code = "referral.codeAlreadySet" / "referral.codeInvalid" /
    "referral.codeReserved" / "referral.codeTaken" on failure.

    Caller is responsible for `await db.commit()` after success.
    """
    normalized = policy.normalize_code(raw_code)

    # Format check
    if not policy.CODE_REGEX.fullmatch(normalized):
        raise CodeError(
            "referral.codeInvalid",
            f"code must be {policy.CODE_MIN_LEN}-{policy.CODE_MAX_LEN} chars [A-Z0-9]",
        )
    # Reserved word check
    if normalized in policy.RESERVED_CODES:
        raise CodeError("referral.codeReserved", f"'{normalized}' is reserved")

    # Already set?
    existing = await repo.get_code_by_user(db, user_id)
    if existing is not None:
        raise CodeError(
            "referral.codeAlreadySet",
            f"user {user_id} already has code {existing.code}",
        )

    # Try insert; rely on DB unique constraint to catch race conditions
    row = ReferralCode(user_id=user_id, code=normalized)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise CodeError(
            "referral.codeTaken", f"code '{normalized}' is already in use"
        ) from e

    logger.info("referral_code_set", user_id=user_id, code=normalized)
    return row
