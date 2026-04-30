"""Rates schemas。"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class RateOut(BaseModel):
    pair: str
    rate: Decimal
    fetched_at: datetime
    source: str
