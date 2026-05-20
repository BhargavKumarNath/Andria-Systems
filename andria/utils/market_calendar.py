"""NYSE/NASDAQ exchange calendar normalization (Phase 4.2).

Wraps the ``exchange_calendars`` library to provide:
- Holiday-aware trading day snapping
- Calendar-accurate exec/exit date arithmetic
- Elimination of the raw ``timedelta``-based date shifts that ignore weekends
  and holidays in the legacy backtest engine.

All public functions accept and return ``datetime.date`` objects (timezone-naive,
representing US/Eastern market dates). UTC conversion is the caller's responsibility
when integrating with external timestamps.

Usage::

    from andria.utils.market_calendar import MarketCalendar
    cal = MarketCalendar()
    exec_date = cal.snap_to_trading_day(raw_date, direction="forward")
    exit_date = cal.snap_to_trading_day(raw_date + timedelta(days=90), direction="backward")
"""

from __future__ import annotations

import datetime
from functools import lru_cache

import exchange_calendars as xcals
import pandas as pd

from andria.core.logging import get_logger

logger = get_logger(__name__)

_EXCHANGE = "XNYS"


@lru_cache(maxsize=1)
def _get_calendar() -> xcals.ExchangeCalendar:
    """Return a cached NYSE calendar instance."""
    return xcals.get_calendar(_EXCHANGE)


class MarketCalendar:
    """Exchange-aware date utilities for the Alpha Factory backtest engine.

    Replaces raw ``timedelta`` arithmetic throughout the pipeline with
    calendar-correct trading day operations.
    """

    def __init__(self, exchange: str = _EXCHANGE) -> None:
        self._cal = xcals.get_calendar(exchange)
        logger.debug("market_calendar_initialised", exchange=exchange)

    # Core predicates
    def is_trading_day(self, date: datetime.date) -> bool:
        """Return True if *date* is a regular NYSE trading session."""
        ts = pd.Timestamp(date)
        return bool(self._cal.is_session(ts))

    # Navigation
    def next_trading_day(self, date: datetime.date) -> datetime.date:
        """Return the next trading day strictly after *date*."""
        ts = pd.Timestamp(date)
        # Find the nearest session on or after ts, then advance one more session
        if self._cal.is_session(ts):
            nxt = self._cal.next_session(ts)
        else:
            # Snap forward to a session, then that IS the next session
            nxt = self._cal.date_to_session(ts, direction="next")
        return nxt.date()

    def prev_trading_day(self, date: datetime.date) -> datetime.date:
        """Return the most recent trading day strictly before *date*."""
        ts = pd.Timestamp(date)
        if self._cal.is_session(ts):
            prv = self._cal.previous_session(ts)
        else:
            prv = self._cal.date_to_session(ts, direction="previous")
        return prv.date()

    def snap_to_trading_day(
        self,
        date: datetime.date,
        direction: str = "forward",
    ) -> datetime.date:
        """Return the nearest trading day on or adjacent to *date*.

        Args:
            date:      The candidate date to snap.
            direction: ``"forward"`` (default) — snap to the next open session;
                       ``"backward"`` — snap to the previous open session.

        Returns:
            A trading day. If *date* is already a trading day, returns *date*
            unchanged.
        """
        ts = pd.Timestamp(date)
        if self._cal.is_session(ts):
            return date
        ec_direction = "next" if direction == "forward" else "previous"
        if direction not in ("forward", "backward"):
            raise ValueError(f"direction must be 'forward' or 'backward', got {direction!r}")
        return self._cal.date_to_session(ts, direction=ec_direction).date()

    # Range arithmetic
    def trading_days_between(
        self,
        start: datetime.date,
        end: datetime.date,
    ) -> int:
        """Return the number of trading days in the half-open interval [start, end).

        Both *start* and *end* are calendar dates; they do not need to be
        trading days themselves.
        """
        sessions = self._cal.sessions_in_range(
            pd.Timestamp(start),
            pd.Timestamp(end),
        )
        return len(sessions)

    def add_trading_days(self, date: datetime.date, n: int) -> datetime.date:
        """Return the date that is exactly *n* trading days after *date*.

        Useful for computing T+1 fill delays and holding period end dates
        in trading-day space rather than calendar-day space.
        """
        ts = pd.Timestamp(date)
        if not self._cal.is_session(ts):
            ts = self._cal.next_session(ts)
        result = self._cal.sessions_window(ts, count=n + 1)[-1]
        return result.date()

    def calendar_days_to_trading_date(
        self,
        anchor: datetime.date,
        calendar_days: int,
        direction: str = "forward",
    ) -> datetime.date:
        """Offset *anchor* by *calendar_days* then snap to a trading day.

        This is the correct replacement for the legacy::

            exec_date = quarter_end + timedelta(days=45)

        which silently lands on weekends and holidays.
        """
        target = anchor + datetime.timedelta(days=calendar_days)
        return self.snap_to_trading_day(target, direction=direction)


# Module-level singleton for convenience imports
_default_calendar: MarketCalendar | None = None


def get_calendar() -> MarketCalendar:
    """Return the process-level default NYSE calendar instance."""
    global _default_calendar
    if _default_calendar is None:
        _default_calendar = MarketCalendar()
    return _default_calendar
