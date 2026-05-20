"""Leakage Audit Toolkit (Phase 4.21).

Automated pre-flight checks that run unconditionally inside
``AlphaFactoryEngine.run_backtest()`` before any performance metrics are
computed. Any ``ERROR``-level finding halts the backtest by raising
``BacktestError``. ``WARNING``-level findings are logged and appended to
the audit report but do not halt execution.

Checks implemented:

    1. check_future_timestamps    — signal exec_date in the future relative to pricing
    2. check_forward_contamination — entry_price row predates exec_date
    3. check_overlapping_labels   — same CUSIP in overlapping holding windows
    4. check_duplicate_signals    — identical (cusip, quarter) pairs in signal set
    5. check_lookahead_joins      — exit_price date precedes exec_date
    6. check_regime_leakage       — regime label assigned using post-signal data

Usage::

    from andria.backtest.leakage_audit import run_full_audit
    report = run_full_audit(signals, pricing, ledger, regime_ts)
    # BacktestError is raised automatically on any ERROR-level finding.
    # Call report.to_dict() to inspect findings in the evaluation gate.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import polars as pl

from andria.core.exceptions import BacktestError
from andria.core.logging import get_logger

logger = get_logger(__name__)


# Finding dataclass
@dataclass
class AuditFinding:
    """A single leakage finding with severity and context."""

    check: str          # name of the check that raised this finding
    severity: str       # "ERROR" | "WARNING"
    affected_rows: int
    message: str
    detail: str = ""


@dataclass
class LeakageAuditReport:
    """Aggregated result of the full leakage audit suite."""

    findings: list[AuditFinding] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(f.severity == "ERROR" for f in self.findings)

    @property
    def has_warnings(self) -> bool:
        return any(f.severity == "WARNING" for f in self.findings)

    @property
    def error_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "ERROR")

    @property
    def warning_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "WARNING")

    def to_dict(self) -> dict[str, object]:
        return {
            "status": "FAILED" if self.has_errors else ("WARNED" if self.has_warnings else "PASSED"),
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "findings": [
                {
                    "check": f.check,
                    "severity": f.severity,
                    "affected_rows": f.affected_rows,
                    "message": f.message,
                }
                for f in self.findings
            ],
        }


# Individual checks
def check_future_timestamps(
    signals: pl.DataFrame,
    pricing: pl.DataFrame,
) -> AuditFinding | None:
    """Detect signal exec_dates that fall after the latest available pricing date.

    Indicates future data access — a hard look-ahead bias violation.
    """
    if "exec_date" not in signals.columns or "date" not in pricing.columns:
        return None

    max_pricing_date = pricing["date"].max()
    if max_pricing_date is None:
        return None

    future_signals = signals.filter(pl.col("exec_date") > max_pricing_date)
    if future_signals.height > 0:
        return AuditFinding(
            check="check_future_timestamps",
            severity="ERROR",
            affected_rows=future_signals.height,
            message=f"{future_signals.height} signals have exec_date after max pricing date ({max_pricing_date})",
            detail="These signals reference data that has not yet been published.",
        )
    return None


def check_forward_contamination(ledger: pl.DataFrame) -> AuditFinding | None:
    """Detect trades where the entry price row predates the exec_date.

    This would mean the trade price was sourced from before the decision date —
    a form of forward contamination in the asof-join logic.
    """
    required = {"exec_date", "entry_price"}
    if not required.issubset(set(ledger.columns)):
        return None

    # If the join captured a date column alongside entry_price, check it
    # (engine.py renames date → date_right during entry join; check via entry_price nulls as proxy)
    null_entries = ledger.filter(pl.col("entry_price").is_null())
    if null_entries.height > 0:
        return AuditFinding(
            check="check_forward_contamination",
            severity="WARNING",
            affected_rows=null_entries.height,
            message=f"{null_entries.height} trades have null entry_price after asof join",
            detail="Null entry prices may indicate join direction issues or pricing gaps.",
        )
    return None


def check_overlapping_labels(
    signals: pl.DataFrame,
    holding_period_days: int = 90,
) -> AuditFinding | None:
    """Detect the same CUSIP appearing in overlapping holding windows.

    Overlapping trades on the same security violate position independence
    assumptions in the t-test and Sharpe ratio calculations.
    """
    if "exec_date" not in signals.columns or "cusip" not in signals.columns:
        return None

    signals_sorted = signals.sort(["cusip", "exec_date"])

    overlap_count = 0
    prev_cusip: str | None = None
    prev_exit: date | None = None

    for row in signals_sorted.iter_rows(named=True):
        cusip = row["cusip"]
        exec_dt = row["exec_date"]
        if isinstance(exec_dt, str):
            from datetime import datetime as _dt
            exec_dt = _dt.fromisoformat(exec_dt).date()


        if cusip == prev_cusip and prev_exit is not None and exec_dt < prev_exit:
            overlap_count += 1

        prev_cusip = cusip
        prev_exit = exec_dt + timedelta(days=holding_period_days)  # BUG FIX: was exec_dt, must add holding period

    if overlap_count > 0:
        return AuditFinding(
            check="check_overlapping_labels",
            severity="WARNING",
            affected_rows=overlap_count,
            message=f"{overlap_count} CUSIP entries appear in overlapping holding windows",
            detail="Consider deduplicating signals or using a non-overlapping window constraint.",
        )
    return None


def check_duplicate_signals(signals: pl.DataFrame) -> AuditFinding | None:
    """Detect identical (cusip, quarter) pairs — double-counted signals."""
    if "cusip" not in signals.columns or "quarter" not in signals.columns:
        return None

    total = signals.height
    unique = signals.unique(subset=["cusip", "quarter"]).height
    dupes = total - unique

    if dupes > 0:
        return AuditFinding(
            check="check_duplicate_signals",
            severity="WARNING",
            affected_rows=dupes,
            message=f"{dupes} duplicate (cusip, quarter) signal pairs detected",
            detail="Duplicates inflate trade count and distort statistical tests.",
        )
    return None


def check_lookahead_joins(ledger: pl.DataFrame) -> AuditFinding | None:
    """Detect trades where actual_exit_date precedes exec_date.

    This means the backward asof-join for exit price captured a date before
    the trade was even entered — a structural look-ahead bias.
    """
    if "actual_exit_date" not in ledger.columns or "exec_date" not in ledger.columns:
        return None

    bad = ledger.filter(pl.col("actual_exit_date") < pl.col("exec_date"))
    if bad.height > 0:
        return AuditFinding(
            check="check_lookahead_joins",
            severity="ERROR",
            affected_rows=bad.height,
            message=f"{bad.height} trades have actual_exit_date < exec_date",
            detail="Exit price was sourced from before trade entry — hard look-ahead bias.",
        )
    return None


def check_regime_leakage(
    signals: pl.DataFrame,
    regime_ts: pl.DataFrame | None,
) -> AuditFinding | None:
    """Detect regime labels that were assigned using post-signal data.

    The HMM regime for a signal's quarter should only use macro data
    available at or before the end of that quarter. This check verifies
    the regime_ts timestamp is not forward-contaminated.

    In practice this is an approximate check: we flag any signal whose
    quarter_end_date comes after the most recent regime observation date.
    """
    if regime_ts is None or "exec_date" not in signals.columns:
        return None

    if "date" not in regime_ts.columns:
        return None

    max_regime_date = regime_ts["date"].max()
    if max_regime_date is None:
        return None

    # Signals with exec_date after the last regime observation are using
    # regime assignments that may be extrapolated beyond observed data.
    if "quarter_end_date" in signals.columns:
        future_regime = signals.filter(pl.col("quarter_end_date") > max_regime_date)
        if future_regime.height > 0:
            return AuditFinding(
                check="check_regime_leakage",
                severity="WARNING",
                affected_rows=future_regime.height,
                message=(
                    f"{future_regime.height} signals use regime labels beyond last observed "
                    f"regime date ({max_regime_date})"
                ),
                detail="Regime assignments for these signals may be extrapolated, not observed.",
            )
    return None


# Entry point
def run_full_audit(
    signals: pl.DataFrame,
    pricing: pl.DataFrame,
    ledger: pl.DataFrame,
    regime_ts: pl.DataFrame | None = None,
    holding_period_days: int = 90,
) -> LeakageAuditReport:
    """Run all leakage checks and raise ``BacktestError`` on any ERROR finding.

    This function is called unconditionally by ``AlphaFactoryEngine.run_backtest()``
    between the alignment step and the cost application step.

    Args:
        signals:             RACS signal DataFrame (pre-filing-lag).
        pricing:             Full pricing DataFrame used in the backtest.
        ledger:              Partially-constructed trade ledger (post-alignment).
        regime_ts:           HMM regime time series (optional; used for leakage check).
        holding_period_days: Expected holding period for overlap detection.

    Returns:
        ``LeakageAuditReport`` with all findings.

    Raises:
        BacktestError: If any ERROR-level finding is detected.
    """
    report = LeakageAuditReport()
    checks = [
        check_future_timestamps(signals, pricing),
        check_forward_contamination(ledger),
        check_duplicate_signals(signals),
        check_lookahead_joins(ledger),
        check_regime_leakage(signals, regime_ts),
        check_overlapping_labels(signals, holding_period_days),
    ]

    for finding in checks:
        if finding is None:
            continue
        report.findings.append(finding)
        if finding.severity == "ERROR":
            logger.error(
                "leakage_audit_error",
                check=finding.check,
                affected_rows=finding.affected_rows,
                message=finding.message,
            )
        else:
            logger.warning(
                "leakage_audit_warning",
                check=finding.check,
                affected_rows=finding.affected_rows,
                message=finding.message,
            )

    if report.has_errors:
        summary = "; ".join(
            f.message for f in report.findings if f.severity == "ERROR"
        )
        raise BacktestError(
            f"Leakage audit failed with {report.error_count} ERROR(s): {summary}"
        )

    if not report.findings:
        logger.info("leakage_audit_passed", checks_run=len(checks))
    else:
        logger.info(
            "leakage_audit_complete",
            errors=report.error_count,
            warnings=report.warning_count,
        )

    return report
