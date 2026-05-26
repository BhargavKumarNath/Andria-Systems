# Andria Systems — Event Timing Framework
**Phase 4.3 Canonical Reference**

This document defines the authoritative timestamp semantics for all signals,
executions, and holding periods in the Andria Alpha Factory backtesting framework.
All backtest code must conform to these definitions. Deviations are a source of
look-ahead bias and must be flagged by the leakage audit toolkit.

---

## Timestamp Hierarchy

```
Quarter End Date
       │
       │ + 45 calendar days (SEC filing deadline)
       ▼
Public Availability Date  ←── snap to next NYSE trading day if weekend/holiday
       │
       │ + fill_delay_days (default: 1 trading day)
       ▼
Execution Timestamp  ←── entry price = open on this day
       │
       │ + holding_period_days calendar days
       ▼
Holding Period End Date  ←── snap to previous NYSE trading day
       │
       ▼
Exit Timestamp  ←── exit price = close on this day (or asof-backward)
```

---

## Precise Definitions

### Signal Timestamp
- **Definition**: The last calendar day of the fiscal quarter to which the 13F filing refers.
- **Values**: `{Q1: Mar 31, Q2: Jun 30, Q3: Sep 30, Q4: Dec 31}`
- **Purpose**: Anchor date from which all subsequent timestamps are derived.
- **Note**: This is *not* the date the signal is actionable.

### Public Availability Date
- **Definition**: Signal timestamp + 45 calendar days.
- **Rationale**: SEC requires institutional managers to file 13F reports within 45 days of quarter end. Before this date, the filing does not exist publicly.
- **Implementation**: `calendar_days_to_trading_date(quarter_end, 45, direction="forward")`
- **Leakage risk**: Using signals before this date is a hard look-ahead bias violation.

### Execution Timestamp
- **Definition**: The next NYSE trading day on or after the public availability date.
- **Implementation**: `MarketCalendar.snap_to_trading_day(public_availability_date, direction="forward")`
- **Price used**: Open price on execution timestamp (not close — using close would imply same-day decision).

### Fill Date (T+1 Open)
- **Definition**: The first trading day *after* the execution timestamp.
- **Rationale**: In practice, institutional orders placed after the filing becomes available are executed the following morning at open.
- **Implementation**: `MarketCalendar.add_trading_days(exec_date, fill_delay_days)` where `fill_delay_days=1`.
- **Price used**: Open price on fill date.

### Holding Period End Date
- **Definition**: Fill date + `holding_period_days` calendar days (default: 90).
- **Implementation**: `calendar_days_to_trading_date(fill_date, holding_period_days, direction="backward")`
- **Price used**: Close price on the nearest preceding trading day.

### Exit Timestamp
- **Definition**: The NYSE trading day used for exit price lookup.
- **Implementation**: `snap_to_trading_day(holding_period_end_date, direction="backward")`

---

## Timezone Policy

| Context | Timezone |
|---|---|
| All internal timestamps | `America/New_York` (US Eastern) |
| Calendar day boundaries | NYSE market close: 16:00 ET |
| Parquet storage format | Date only (no time component) for event study |
| External API data (yfinance) | Dates only; Yahoo Finance returns ET dates |

---

## Corporate Action Handling

- All pricing uses `Adj Close` from Yahoo Finance (split + dividend adjusted).
- A 2×+ single-day price change triggers a `corporate_action_warning` log event.
- Back-adjusted prices are used for *all* historical return calculations.
- **Never use unadjusted `Close`** — doing so introduces spurious return spikes at split events.

---

## Common Violations (Leakage Audit Checks)

| Violation | Description | Severity |
|---|---|---|
| Signal before filing lag | Using 13F data within 45 days of quarter end | ERROR |
| Weekend/holiday entry | Entry price on non-trading day | ERROR |
| Exit before entry | Holding period end before exec date | ERROR |
| Regime future leak | Regime label uses post-signal macro data | ERROR |
| Overlapping positions | Same CUSIP in concurrent holding windows | WARNING |
| Same-day close entry | Using close on exec_date (not T+1 open) | WARNING |

---

## Reference Implementation

```python
from andria.utils.market_calendar import MarketCalendar
from andria.core.config import get_settings

cfg = get_settings()
cal = MarketCalendar()

# Correct: calendar-aware exec date
exec_date = cal.calendar_days_to_trading_date(
    quarter_end_date,
    cfg.backtest.filing_lag_days,   # 45
    direction="forward",
)

# Correct: T+1 fill date
fill_date = cal.add_trading_days(exec_date, cfg.execution.fill_delay_days)  # +1

# Correct: exit date
exit_date = cal.calendar_days_to_trading_date(
    fill_date,
    cfg.backtest.holding_period_days,  # 90
    direction="backward",
)
```

---

*Last updated: Phase 4 implementation. Maintained by the Andria quant research team.*
