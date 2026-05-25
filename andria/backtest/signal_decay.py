"""Signal Half-Life and Decay Analysis (Phase 4.18).

Measures alpha persistence across multiple holding horizons to determine:
- How quickly the RACS signal's predictive power decays
- Whether the signal requires fast execution or tolerates drift
- Regime-conditioned decay curves (does signal decay faster in stress regimes?)

The Information Coefficient (IC) is the rank correlation between the RACS
score and the realized forward return at each horizon. It is the canonical
measure of signal quality in the quant industry.

Decay half-life is the horizon at which IC drops below ``ic_halflife_threshold``
(default 0.05 — effectively zero predictive power).

Usage::

    from andria.backtest.signal_decay import SignalDecayAnalyzer
    analyzer = SignalDecayAnalyzer(horizons=[1, 5, 20, 60])
    decay_df = analyzer.compute(signals, pricing)
    analyzer.print_summary(decay_df)
"""

from __future__ import annotations

from datetime import date

import numpy as np
import polars as pl
from rich.console import Console
from rich.table import Table
from scipy.stats import spearmanr

_console = Console()

from andria.core.logging import get_logger
from andria.utils.market_calendar import MarketCalendar

logger = get_logger(__name__)

_DEFAULT_HORIZONS = [1, 5, 20, 60]  # trading days


class SignalDecayAnalyzer:
    """Measures IC decay of the RACS signal across holding horizons.

    Args:
        horizons:             List of holding periods in trading days.
        ic_halflife_threshold: IC level below which signal is considered decayed.
    """

    def __init__(
        self,
        horizons: list[int] = _DEFAULT_HORIZONS,
        ic_halflife_threshold: float = 0.05,
    ) -> None:
        self.horizons = sorted(horizons)
        self.ic_halflife_threshold = ic_halflife_threshold

    def compute(
        self,
        signals: pl.DataFrame,
        pricing: pl.DataFrame,
        regime_conditioned: bool = True,
    ) -> pl.DataFrame:
        """Compute IC at each holding horizon.

        For each horizon H, the forward return from exec_date to exec_date+H
        is joined from pricing via asof-join, then IC = spearmanr(RACS, fwd_return).

        Args:
            signals:           RACS signal DataFrame with ``exec_date``,
                               ``cusip``, ``regime_adjusted_racs``.
            pricing:           OHLCV pricing with ``close_adj``, ``cusip``, ``date``.
            regime_conditioned: If True, also compute IC by regime label.

        Returns:
            Polars DataFrame with columns:
            [horizon_days, ic, ic_tstat, n_obs, regime] where
            regime="All" for the aggregate row.
        """
        required_signals = {"exec_date", "cusip", "regime_adjusted_racs"}
        required_pricing = {"date", "cusip", "close_adj"}

        if not required_signals.issubset(set(signals.columns)):
            raise ValueError(f"Signals missing: {required_signals - set(signals.columns)}")
        if not required_pricing.issubset(set(pricing.columns)):
            raise ValueError(f"Pricing missing: {required_pricing - set(pricing.columns)}")

        pricing_sorted = pricing.select(["cusip", "date", "close_adj"]).sort(["cusip", "date"])
        rows: list[dict] = []

        regimes = ["All"]
        if regime_conditioned and "regime_label" in signals.columns:
            regimes += signals["regime_label"].unique().to_list()

        calendar = MarketCalendar()

        for horizon in self.horizons:
            # Compute forward return over this horizon for each signal
            signals_h = signals.sort(["cusip", "exec_date"])

            # Entry price: asof join at exec_date
            entry = signals_h.join_asof(
                pricing_sorted,
                left_on="exec_date",
                right_on="date",
                by="cusip",
                strategy="forward",
            ).rename({"close_adj": "entry_close"})

            # Exit price: exec_date + horizon trading days
            # Using precise MarketCalendar trading-day arithmetic
            def add_td(dt: date, h: int = horizon) -> date:
                return calendar.add_trading_days(dt, h)

            exit_col = entry.with_columns(
                pl.col("exec_date").map_elements(add_td, return_dtype=pl.Date).alias("exit_date_exact")
            ).sort(["cusip", "exit_date_exact"])

            exit_joined = exit_col.join_asof(
                pricing_sorted.rename({"close_adj": "exit_close", "date": "exit_date_actual"}),
                left_on="exit_date_exact",
                right_on="exit_date_actual",
                by="cusip",
                strategy="backward",
            )

            exit_joined = exit_joined.with_columns(
                ((pl.col("exit_close") - pl.col("entry_close")) / pl.col("entry_close")).alias("fwd_return")
            ).drop_nulls(subset=["fwd_return", "regime_adjusted_racs"])

            for regime in regimes:
                if regime == "All":
                    subset = exit_joined
                else:
                    if "regime_label" not in exit_joined.columns:
                        continue
                    subset = exit_joined.filter(pl.col("regime_label") == regime)

                n = subset.height
                if n < 10:
                    continue

                racs = subset["regime_adjusted_racs"].to_numpy()
                fwd = subset["fwd_return"].to_numpy()

                ic, p_val = spearmanr(racs, fwd)
                ic = float(ic)

                # t-statistic for IC
                ic_tstat = ic * np.sqrt(n - 2) / np.sqrt(1 - ic ** 2) if abs(ic) < 1 else float("nan")

                rows.append({
                    "horizon_days": horizon,
                    "regime": regime,
                    "ic": round(ic, 5),
                    "ic_tstat": round(float(ic_tstat), 3) if not np.isnan(ic_tstat) else float("nan"),
                    "ic_pvalue": round(float(p_val), 4),
                    "n_obs": n,
                })

                logger.info(
                    "signal_decay_horizon",
                    horizon=horizon,
                    regime=regime,
                    ic=round(ic, 4),
                    n=n,
                )

        return pl.DataFrame(rows)

    def estimate_halflife(self, decay_df: pl.DataFrame) -> int | None:
        """Estimate the horizon (in trading days) at which IC drops below threshold.

        Args:
            decay_df: Output from ``compute()`` filtered to regime="All".

        Returns:
            Half-life in trading days, or None if IC never drops below threshold.
        """
        all_rows = decay_df.filter(pl.col("regime") == "All").sort("horizon_days")
        for row in all_rows.iter_rows(named=True):
            if abs(row["ic"]) < self.ic_halflife_threshold:
                return int(row["horizon_days"])
        return None

    @staticmethod
    def print_summary(decay_df: pl.DataFrame) -> None:
        """Display a formatted IC decay table."""
        all_data = decay_df.filter(pl.col("regime") == "All").sort("horizon_days")
        table = Table(title="Signal Decay — IC by Horizon (All Regimes)", show_lines=False)
        table.add_column("Horizon", justify="right")
        table.add_column("IC", justify="right")
        table.add_column("IC t-stat", justify="right")
        table.add_column("p-value", justify="right")
        table.add_column("N", justify="right")
        for row in all_data.iter_rows(named=True):
            table.add_row(
                f"{row['horizon_days']}d",
                f"{row['ic']:.5f}",
                f"{row['ic_tstat']:.3f}",
                f"{row['ic_pvalue']:.4f}",
                str(row["n_obs"]),
            )
        _console.print(table)
