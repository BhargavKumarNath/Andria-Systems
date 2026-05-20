"""Data Provenance & Coverage Tracking (Phase 4.20).

Every trade in the ledger must be traceable to its data source. This module
provides:

- ``ProvenanceRecord`` — per-ticker coverage metadata
- ``CoverageReport`` — aggregate summary across all tickers in a backtest run
- ``ProvenanceTracker`` — attaches provenance metadata to the trade ledger
  and persists a JSON audit file per run

Trades with ``coverage_quality != "full"`` are flagged in the evaluation
gate and excluded from the primary Sharpe calculation. This ensures that
no performance figure is quoted without knowing the data quality underlying it.

Usage::

    from andria.data.provenance import ProvenanceTracker
    tracker = ProvenanceTracker(run_id="abc12345")
    tracker.ingest_coverage_report(loader.last_coverage_report)
    ledger = tracker.attach(ledger, pricing)
    report = tracker.build_report()
    tracker.save(cfg.paths.artifacts)
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import polars as pl

from andria.core.logging import get_logger

logger = get_logger(__name__)

# Minimum acceptable full-coverage threshold for credible backtest results
FULL_COVERAGE_THRESHOLD_PCT = 70.0


@dataclass
class ProvenanceRecord:
    """Coverage metadata for a single ticker/CUSIP."""

    cusip: str
    ticker: str | None
    dataset_source: str          # e.g. "yfinance_cached", "yfinance_live", "unmapped"
    fetch_timestamp: str         # ISO-8601 UTC
    coverage_start: str | None   # earliest date available
    coverage_end: str | None     # latest date available
    missing_days_pct: float      # fraction of expected trading days missing
    stale_flag: bool             # True if data is older than stale_threshold_days
    insufficient_history: bool   # True if < 252 trading days available


@dataclass
class CoverageReport:
    """Aggregate coverage summary for a backtest run."""

    run_id: str
    generated_at: str
    total_cusips: int
    mapped_count: int
    unmapped_count: int
    failed_count: int
    stale_count: int
    insufficient_history_count: int
    coverage_pct: float
    unmapped_cusips: list[str] = field(default_factory=list)
    failed_tickers: list[str] = field(default_factory=list)
    records: list[ProvenanceRecord] = field(default_factory=list)

    @property
    def is_credible(self) -> bool:
        """True if coverage meets the minimum threshold for credible results."""
        return self.coverage_pct >= FULL_COVERAGE_THRESHOLD_PCT

    def summary_lines(self) -> list[str]:
        lines = [
            f"Coverage: {self.coverage_pct:.1f}% ({self.mapped_count}/{self.total_cusips} CUSIPs mapped)",
            f"Unmapped: {self.unmapped_count} | Failed: {self.failed_count} | Stale: {self.stale_count}",
            f"Insufficient history (<252d): {self.insufficient_history_count}",
        ]
        if not self.is_credible:
            lines.append(
                f"WARNING: Coverage {self.coverage_pct:.1f}% < threshold {FULL_COVERAGE_THRESHOLD_PCT:.0f}% — "
                "backtest results should not be presented as credible alpha evidence"
            )
        return lines


class ProvenanceTracker:
    """Attaches and persists data provenance metadata throughout the backtest pipeline.

    Args:
        run_id: Short unique identifier for the current backtest run.
    """

    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self._records: list[ProvenanceRecord] = []
        self._raw_coverage: dict[str, object] = {}
        self._now = datetime.utcnow().isoformat()

    def ingest_coverage_report(self, report: dict[str, object]) -> None:
        """Consume the coverage dict from ``MarketDataLoader.last_coverage_report``."""
        self._raw_coverage = report
        logger.info(
            "provenance_coverage_ingested",
            coverage_pct=report.get("coverage_pct"),
            unmapped=report.get("unmapped"),
            failed=len(report.get("failed_tickers", [])),  # type: ignore[arg-type]
        )

    def add_record(self, record: ProvenanceRecord) -> None:
        """Add a single ticker-level provenance record."""
        self._records.append(record)

    def attach(self, ledger: pl.DataFrame, pricing: pl.DataFrame) -> pl.DataFrame:
        """Attach provenance columns to every trade in the ledger.

        Adds:
        - ``data_source``: pricing_source value for the entry-date row
        - ``coverage_quality``: "full" | "partial" | "stale" | "unmapped"

        Trades with ``coverage_quality != "full"`` are tagged for exclusion
        from the primary Sharpe computation.

        Args:
            ledger:  Trade ledger from ``AlphaFactoryEngine.run_backtest()``.
            pricing: Pricing DataFrame with ``pricing_source`` column.

        Returns:
            Ledger with ``data_source`` and ``coverage_quality`` columns appended.
        """
        if "pricing_source" not in pricing.columns:
            logger.warning("provenance_attach_skip", reason="pricing_source column missing")
            return ledger.with_columns([
                pl.lit("unknown").alias("data_source"),
                pl.lit("unknown").alias("coverage_quality"),
            ])

        # Derive per-cusip source from the latest pricing row
        source_map = (
            pricing.sort("date")
            .group_by("cusip")
            .agg(pl.col("pricing_source").last().alias("data_source"))
        )

        ledger = ledger.join(source_map, on="cusip", how="left")

        # Determine coverage quality
        stale_tickers: list[str] = list(self._raw_coverage.get("stale_tickers", []))  # type: ignore[arg-type]
        insufficient: list[str] = list(self._raw_coverage.get("insufficient_history_tickers", []))  # type: ignore[arg-type]

        ledger = ledger.with_columns(
            pl.when(pl.col("data_source").is_null())
            .then(pl.lit("unmapped"))
            .when(pl.col("ticker").is_in(stale_tickers))
            .then(pl.lit("stale"))
            .when(pl.col("ticker").is_in(insufficient))
            .then(pl.lit("partial"))
            .otherwise(pl.lit("full"))
            .alias("coverage_quality")
        )

        non_full = ledger.filter(pl.col("coverage_quality") != "full").height
        if non_full > 0:
            logger.warning(
                "trades_with_non_full_coverage",
                count=non_full,
                note="These trades are excluded from primary Sharpe calculation",
            )

        return ledger

    def build_report(self) -> CoverageReport:
        """Construct the aggregate CoverageReport from ingested data."""
        raw = self._raw_coverage
        report = CoverageReport(
            run_id=self._run_id,
            generated_at=self._now,
            total_cusips=int(raw.get("total_cusips", 0)),
            mapped_count=int(raw.get("mapped", 0)),
            unmapped_count=int(raw.get("unmapped", 0)),
            failed_count=len(raw.get("failed_tickers", [])),  # type: ignore[arg-type]
            stale_count=len(raw.get("stale_tickers", [])),  # type: ignore[arg-type]
            insufficient_history_count=len(raw.get("insufficient_history_tickers", [])),  # type: ignore[arg-type]
            coverage_pct=float(raw.get("coverage_pct", 0.0)),
            unmapped_cusips=list(raw.get("unmapped_cusips", [])),  # type: ignore[arg-type]
            failed_tickers=list(raw.get("failed_tickers", [])),  # type: ignore[arg-type]
            records=self._records,
        )

        for line in report.summary_lines():
            if "WARNING" in line:
                logger.warning("coverage_report_warning", message=line)
            else:
                logger.info("coverage_report", message=line)

        return report

    def save(self, artifacts_dir: Path) -> Path:
        """Persist the coverage report as JSON for audit trail.

        Args:
            artifacts_dir: Root artifacts directory (``cfg.paths.artifacts``).

        Returns:
            Path to the written JSON file.
        """
        report = self.build_report()
        out_dir = artifacts_dir / "provenance"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{self._run_id}_coverage.json"

        # Serialize: convert dataclass → dict, handle nested records
        serializable = asdict(report)
        serializable["records"] = [asdict(r) for r in report.records]

        with open(out_path, "w") as fh:
            json.dump(serializable, fh, indent=2, default=str)

        logger.info("provenance_report_saved", path=str(out_path))
        return out_path
