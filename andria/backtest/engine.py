"""Alpha Factory Backtest Engine — Event-Study Framework.

Strictly enforces look-ahead bias elimination by applying the 45-day
SEC filing lag before joining against pricing data using Polars asof joins.

Peak memory approx: ~2-3 GB for 116M EDGAR rows + 10Y pricing history.
"""

from __future__ import annotations

from datetime import timedelta
import warnings

import polars as pl

from andria.backtest.costs import TransactionCostModel
from andria.backtest.diagnostics import calculate_sharpe, regime_conditional_metrics
from andria.core.config import get_settings
from andria.core.exceptions import BacktestError
from andria.core.logging import get_logger

logger = get_logger(__name__)


class AlphaFactoryEngine:
    """Core event-study backtester for SEC 13F signals."""

    def __init__(self) -> None:
        self._cfg = get_settings()
        self._cost_model = TransactionCostModel()
        self._lag_days = self._cfg.backtest.filing_lag_days
        self._hold_days = self._cfg.backtest.holding_period_days

    def _apply_filing_lag(self, signals: pl.DataFrame) -> pl.DataFrame:
        """Converts diverse quarter strings to exact tradable dates.
        Handles '2023Q1', '2023_Q1', '2024_JANUARY_FEBRUARY', etc.
        """
        if "quarter" not in signals.columns:
            raise BacktestError("Signals must contain a 'quarter' column.")

        # 1. Extract Year
        signals = signals.with_columns(
            pl.col("quarter").str.extract(r"(\d{4})", 1).cast(pl.Int32).alias("year")
        )

        # 2. Extract Quarter Number (prioritize Q1-Q4 if present)
        signals = signals.with_columns(
            pl.when(pl.col("quarter").str.contains("Q1|JANUARY|FEBRUARY|MARCH"))
            .then(pl.lit(1))
            .when(pl.col("quarter").str.contains("Q2|APRIL|MAY|JUNE"))
            .then(pl.lit(2))
            .when(pl.col("quarter").str.contains("Q3|JULY|AUGUST|SEPTEMBER"))
            .then(pl.lit(3))
            .otherwise(pl.lit(4))
            .alias("q_num")
        )

        return signals.with_columns(
            # Determine end of quarter date
            pl.when(pl.col("q_num") == 1).then(pl.date(pl.col("year"), 3, 31))
            .when(pl.col("q_num") == 2).then(pl.date(pl.col("year"), 6, 30))
            .when(pl.col("q_num") == 3).then(pl.date(pl.col("year"), 9, 30))
            .otherwise(pl.date(pl.col("year"), 12, 31))
            .alias("quarter_end_date")
        ).with_columns(
            # Add exact SEC filing lag (Look-ahead bias elimination)
            (pl.col("quarter_end_date") + timedelta(days=self._lag_days)).alias("exec_date"),
            # Add holding period end date
            (pl.col("quarter_end_date") + timedelta(days=self._lag_days + self._hold_days)).alias("exit_date")
        ).drop(["year", "q_num"])

    def _align_pricing(self, signals: pl.DataFrame, pricing: pl.DataFrame) -> pl.DataFrame:
        """Joins signals to pricing using asof-joins to handle weekends/holidays."""
        req_pricing = {"cusip", "date", "close_adj", "volume_30d_avg", "volatility_30d"}
        if not req_pricing.issubset(set(pricing.columns)):
            raise BacktestError(f"Pricing DataFrame missing required columns: {req_pricing}")

        pricing = pricing.with_columns(pl.col("date").cast(pl.Date)).sort(["cusip", "date"])
        signals = signals.sort(["cusip", "exec_date"])

        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Sortedness of columns cannot be checked")
            
            # Join for Entry Price (closest trading day ON OR AFTER the exec_date)
            entry_joined = signals.join_asof(
                pricing,
                left_on="exec_date",
                right_on="date",
                by="cusip",
                strategy="forward"  # Must trade at the NEXT open market day
            ).rename({"close_adj": "entry_price"})

            # Join for Exit Price
            entry_joined = entry_joined.sort(["cusip", "exit_date"])
            final_joined = entry_joined.join_asof(
                pricing.select(["cusip", "date", "close_adj"]),
                left_on="exit_date",
                right_on="date",
                by="cusip",
                strategy="backward" # Exit at the PREVIOUS close if exit_date is weekend
            ).rename({"close_adj": "exit_price", "date_right": "actual_exit_date"})

        return final_joined.with_columns(
            ((pl.col("exit_price") - pl.col("entry_price")) / pl.col("entry_price")).alias("fwd_return_raw")
        ).drop(["date"])  # clean up joining artifact

    def run_backtest(
        self, 
        signals: pl.DataFrame, 
        pricing: pl.DataFrame, 
        top_n_decile: float | None = 0.90
    ) -> dict[str, object]:
        """Executes the full pipeline: lag enforcement -> alignment -> costs -> diagnostics.
        
        Args:
            signals: RACS DataFrame generated in Phase 2.
            pricing: Historical pricing dataset.
            top_n_decile: Quantile threshold for going long on signals. Set to None
                to trade every signal without conviction filtering.
            
        Returns:
            Dictionary containing backtest metrics and the ledger DataFrame.
        """
        logger.info("backtest_started", signals=len(signals), pricing_rows=len(pricing))
        
        # 1. Look-ahead bias elimination
        lagged_signals = self._apply_filing_lag(signals)
        
        # 2. Filter for long signals (Top Conviction)
        if top_n_decile is None:
            threshold = None
            long_portfolio = lagged_signals
        else:
            if not 0.0 <= top_n_decile <= 1.0:
                raise BacktestError("top_n_decile must be between 0.0 and 1.0, or None for all signals.")
            threshold = lagged_signals["regime_adjusted_racs"].quantile(top_n_decile)
            long_portfolio = lagged_signals.filter(pl.col("regime_adjusted_racs") >= threshold)
        logger.info(
            "signal_filter_applied",
            top_n_decile=top_n_decile,
            threshold=threshold,
            selected=len(long_portfolio),
            total=len(lagged_signals),
        )
        
        # 3. Temporal alignment
        trade_ledger = self._align_pricing(long_portfolio, pricing)
        
        # Handle survivorship bias: If exit price is null, assume -100% (delisted/bankrupt)
        trade_ledger = trade_ledger.with_columns(
            pl.col("fwd_return_raw").fill_null(-1.0)
        )
        
        # The cost model expects 'close_price' for its internal ADTV calculations
        if "close_price" not in trade_ledger.columns and "entry_price" in trade_ledger.columns:
            trade_ledger = trade_ledger.with_columns(pl.col("entry_price").alias("close_price"))
            
        # Calculate Liquidity-Bounded Position Sizing
        # 1. Base weight proportional to inverse volatility
        # 2. Multiply by target portfolio size per signal (e.g. $1M base)
        # 3. Constrain to max 5% of ADTV
        target_allocation_usd = 1_000_000.0
        trade_ledger = trade_ledger.with_columns(
            pl.col("volume_30d_avg").mul(pl.col("close_price")).alias("adtv_usd")
        ).with_columns(
            (pl.lit(target_allocation_usd) / pl.col("volatility_30d").clip(lower_bound=0.01))
            .clip(upper_bound=pl.col("adtv_usd") * 0.05)
            .alias("position_size_usd")
        )
        
        # 4. Apply transaction costs
        trade_ledger = self._cost_model.apply_costs(trade_ledger)
        
        # 5. Diagnostics & Reporting
        metrics = regime_conditional_metrics(trade_ledger)
        
        # Overall sanity check
        overall_sharpe = calculate_sharpe(trade_ledger["net_fwd_return"])
        logger.info("backtest_completed", overall_sharpe=round(overall_sharpe, 2))
        
        return {
            "metrics_by_regime": metrics,
            "overall_sharpe": overall_sharpe,
            "ledger": trade_ledger,
            "survivorship_flags": trade_ledger.filter(pl.col("fwd_return_raw") == -1.0).height
        }
