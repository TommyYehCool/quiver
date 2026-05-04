"""Onboarding funnel event log (F-5b-4).

One row per user × event. Append-only, no updates. Used to compute
funnel drop-off and per-user stall analysis.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class FunnelEvent(Base):
    __tablename__ = "funnel_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Convention: snake_case verb_noun, past tense
    # signup_completed / kyc_submitted / bitfinex_connect_failed / etc.
    event_name: Mapped[str] = mapped_column(String(64), nullable=False)
    # Optional metadata — for failure reasons, A/B variant, etc.
    # E.g., bitfinex_connect_failed → {"error_code": "earn.bitfinexAuthFailed"}
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
