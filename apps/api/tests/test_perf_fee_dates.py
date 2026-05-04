"""Pure-function tests for date helpers in perf_fee + earn endpoints.

`previous_iso_week_range` decides which Mon-Sun the weekly accrual covers.
Off-by-one here = double-charge (re-bill last week) or under-charge (skip
a week's earnings). Easy to write, easy to break, must be tested.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.services.earn.perf_fee import previous_iso_week_range


@pytest.mark.parametrize(
    "today,expected_start,expected_end",
    [
        # Cron typically fires on Monday 02:00 UTC. Most common case.
        (date(2026, 5, 4),  date(2026, 4, 27), date(2026, 5, 3)),   # Monday
        (date(2026, 5, 5),  date(2026, 4, 27), date(2026, 5, 3)),   # Tuesday
        (date(2026, 5, 7),  date(2026, 4, 27), date(2026, 5, 3)),   # Thursday
        (date(2026, 5, 10), date(2026, 4, 27), date(2026, 5, 3)),   # Sunday — still last Mon-Sun
        # Year boundary
        (date(2026, 1, 5),  date(2025, 12, 29), date(2026, 1, 4)),  # Monday
        (date(2026, 1, 1),  date(2025, 12, 22), date(2025, 12, 28)), # Thursday
        # Leap year boundary
        (date(2024, 3, 4),  date(2024, 2, 26), date(2024, 3, 3)),   # Monday after Feb 29
    ],
)
def test_previous_iso_week_range(today: date, expected_start: date, expected_end: date) -> None:
    start, end = previous_iso_week_range(today)
    assert start == expected_start, f"on {today}: expected start {expected_start}, got {start}"
    assert end == expected_end, f"on {today}: expected end {expected_end}, got {end}"


def test_previous_iso_week_range_always_monday_to_sunday() -> None:
    """Every result must span exactly Monday → Sunday (7 days, weekday 0 → 6)."""
    for offset_days in range(0, 365):
        today = date(2026, 1, 1) + (date(2026, 1, 1) - date(2026, 1, 1))  # placeholder
        # Use a sweep across the year to catch any weekday-edge bugs
        from datetime import timedelta
        today = date(2026, 1, 1) + timedelta(days=offset_days)
        start, end = previous_iso_week_range(today)
        assert start.weekday() == 0, f"on {today}: start {start} is not a Monday (weekday={start.weekday()})"
        assert end.weekday() == 6, f"on {today}: end {end} is not a Sunday (weekday={end.weekday()})"
        assert (end - start).days == 6, f"on {today}: span is {(end - start).days} days, expected 6"


def test_previous_iso_week_range_never_includes_today() -> None:
    """The 'previous' week must end strictly before today (no overlap)."""
    from datetime import timedelta
    for offset_days in range(0, 365):
        today = date(2026, 1, 1) + timedelta(days=offset_days)
        _, end = previous_iso_week_range(today)
        assert end < today, f"on {today}: previous-week end {end} should be < today"


def test_previous_iso_week_range_uses_today_default(monkeypatch) -> None:
    """If today is not passed, it should default to UTC today — important
    so the cron handler doesn't need to compute it."""
    import datetime as dt

    class FakeDateTime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return dt.datetime(2026, 5, 4, 2, 0, 0, tzinfo=tz or dt.timezone.utc)

    monkeypatch.setattr("app.services.earn.perf_fee.datetime", FakeDateTime)
    start, end = previous_iso_week_range()
    assert start == date(2026, 4, 27)
    assert end == date(2026, 5, 3)
