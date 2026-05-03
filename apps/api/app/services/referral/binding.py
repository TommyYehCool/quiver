"""Referee → referrer binding (F-4b).

Bind rules:
  - Each user can be bound at most once (no rebinding via API)
  - Cannot self-refer
  - Cycle prevention: walk up referrer's chain, reject if we hit referee
  - Code must already exist (resolved via referral_codes table)

Multi-level walk:
  - get_chain(user_id, max_depth=N) returns up to N ancestors:
    [L1 referrer, L2 referrer, ...]
  - Used by payout to determine who gets paid 10% / 5%
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.referral import Referral, ReferralBindingSource
from app.services.referral import policy, repo

logger = get_logger(__name__)


class BindError(Exception):
    """Raised when binding fails. .code holds an i18n key."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


# ─────────────────────────────────────────────────────────
# Chain walk
# ─────────────────────────────────────────────────────────


async def get_chain(
    db: AsyncSession, user_id: int, *, max_depth: int = 2
) -> list[int]:
    """Return up to `max_depth` ancestors of `user_id`.

    [direct referrer, grandparent, great-grandparent, ...]
    Stops walking when chain ends, hits a cycle, or hits max_depth.

    Used by payout (max_depth=2) and by cycle-check at bind time
    (max_depth=large enough to detect any cycle).
    """
    chain: list[int] = []
    cursor = user_id
    seen = {user_id}
    while len(chain) < max_depth:
        ref = await repo.get_referral_by_referee(db, cursor)
        if ref is None:
            break
        if ref.referrer_user_id in seen:
            # Cycle detected — abort. Shouldn't happen if bind() is the only
            # writer, but defensive.
            logger.warning(
                "referral_chain_cycle_detected",
                user_id=user_id,
                cursor=cursor,
                referrer=ref.referrer_user_id,
            )
            break
        chain.append(ref.referrer_user_id)
        seen.add(ref.referrer_user_id)
        cursor = ref.referrer_user_id
    return chain


# ─────────────────────────────────────────────────────────
# Bind
# ─────────────────────────────────────────────────────────


async def bind(
    db: AsyncSession,
    *,
    referee_user_id: int,
    referrer_code: str,
    source: ReferralBindingSource,
) -> Referral:
    """Bind referee to the user owning `referrer_code`. Raises BindError on
    failure.

    Caller is responsible for `await db.commit()` after success.
    """
    normalized = policy.normalize_code(referrer_code)
    if not policy.CODE_REGEX.fullmatch(normalized):
        raise BindError("referral.codeInvalid")

    # Resolve referrer
    code_row = await repo.get_code_owner(db, normalized)
    if code_row is None:
        raise BindError("referral.codeNotFound")
    referrer_user_id = code_row.user_id

    # Self-refer check
    if referrer_user_id == referee_user_id:
        raise BindError("referral.selfReferral")

    # Already bound check
    existing = await repo.get_referral_by_referee(db, referee_user_id)
    if existing is not None:
        raise BindError("referral.alreadyBound")

    # Cycle check: walk up referrer's chain (large depth) — if referee is
    # anywhere in there, the new edge would close a loop. Reject.
    upstream = await get_chain(db, referrer_user_id, max_depth=64)
    if referee_user_id in upstream:
        raise BindError("referral.cycleDetected")

    row = Referral(
        referee_user_id=referee_user_id,
        referrer_user_id=referrer_user_id,
        binding_source=source.value,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise BindError("referral.alreadyBound") from e

    logger.info(
        "referral_bound",
        referee=referee_user_id,
        referrer=referrer_user_id,
        source=source.value,
    )
    return row
