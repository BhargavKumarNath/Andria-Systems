"""Alpha Factory Backtest Engine — Event-Study Framework (Phase 4 updated).

Strictly enforces look-ahead bias elimination by applying the 45-day
SEC filing lag before joining against pricing data using Polars asof joins.

Phase 4 additions:
- Exchange-calendar-aware exec/exit date snapping (replaces raw timedelta arithmetic)
- Execution realism via ExecutionEngine V1 (T+1 fill, slippage, ADV cap)
- Mandatory LeakageAudit pre-flight check before any metrics are computed
- Data provenance metadata attached to every trade

Peak memory approx: ~2-3 GB for 116M EDGAR rows + 10Y pricing history.
"""

from __future__ import annotations

import warnings

import polars as pl

from andria.backtest.costs import TransactionCostModel
from andria.backtest.diagnostics import calculate_sharpe, regime_conditional_metrics
from andria.backtest.execution import ExecutionEngine
from andria.backtest.leakage_audit import LeakageAuditReport, run_full_audit
from andria.core.config import get_settings
from andria.core.exceptions import BacktestError
from andria.core.logging import get_logger
from andria.utils.market_calendar import MarketCalendar

logger = get_logger(__name__)


class AlphaFactoryEngine:
    """Core event-study backtester for SEC 13F signals."""

    def __init__(self) -> None:
        self._cfg = get_settings()
        self._cost_model = TransactionCostModel()
        self._execution = ExecutionEngine()
        self._calendar = MarketCalendar()
        self._lag_days = self._cfg.backtest.filing_lag_days
        self._hold_days = self._cfg.backtest.holding_period_days

    def _apply_filing_lag(self, signals: pl.DataFrame) -> pl.DataFrame:
        """Converts quarter strings to calendar-aware tradable dates.

        Phase 4: uses MarketCalendar.calendar_days_to_trading_date() to snap
        exec/exit dates to real NYSE trading days, replacing raw timedelta offsets
        that silently land on weekends and holidays.

        Handles '2023Q1', '2023_Q1', '2024_JANUARY_FEBRUARY', etc.
        """
        if "quarter" not in signals.columns:
            raise BacktestError("Signals must contain a 'quarter' column.")

        # 1. Extract Year
        signals = signals.with_columns(
            pl.col("quarter").str.extract(r"(\d{4})", 1).cast(pl.Int32).alias("year")
        )

        # 2. Extract Quarter Number
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

        signals = signals.with_columns(
            pl.when(pl.col("q_num") == 1).then(pl.date(pl.col("year"), 3, 31))
            .when(pl.col("q_num") == 2).then(pl.date(pl.col("year"), 6, 30))
            .when(pl.col("q_num") == 3).then(pl.date(pl.col("year"), 9, 30))
            .otherwise(pl.date(pl.col("year"), 12, 31))
            .alias("quarter_end_date")
        ).drop(["year", "q_num"])

        # 3. Calendar-aware date snapping (Phase 4.2)
        exec_dates = []
        exit_dates = []
        for row in signals.select("quarter_end_date").iter_rows():
            qe = row[0]
            exec_dt = self._calendar.calendar_days_to_trading_date(
                qe, self._lag_days, direction="forward"
            )
            exit_dt = self._calendar.calendar_days_to_trading_date(
                qe, self._lag_days + self._hold_days, direction="backward"
            )
            exec_dates.append(exec_dt)
            exit_dates.append(exit_dt)

        return signals.with_columns([
            pl.Series("exec_date", exec_dates, dtype=pl.Date),
            pl.Series("exit_date", exit_dates, dtype=pl.Date),
        ])

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
                strategy="forward",
            ).rename({"close_adj": "entry_price"})

            # Join for Exit Price
            entry_joined = entry_joined.sort(["cusip", "exit_date"])
            final_joined = entry_joined.join_asof(
                pricing.select(["cusip", "date", "close_adj"]),
                left_on="exit_date",
                right_on="date",
                by="cusip",
                strategy="backward",
            ).rename({"close_adj": "exit_price", "date_right": "actual_exit_date"})

        return final_joined.with_columns(
            ((pl.col("exit_price") - pl.col("entry_price")) / pl.col("entry_price")).alias("fwd_return_raw")
        ).drop(["date"])

    def run_backtest(
        self,
        signals: pl.DataFrame,
        pricing: pl.DataFrame,
        top_n_decile: float | None = 0.90,
        regime_ts: pl.DataFrame | None = None,
    ) -> dict[str, object]:
        """Executes the full pipeline: lag → alignment → leakage audit → execution → costs → diagnostics.

        Args:
            signals:      RACS DataFrame generated in Phase 2.
            pricing:      Historical pricing dataset.
            top_n_decile: Quantile threshold for going long on signals.
            regime_ts:    HMM regime time series (used for regime leakage check).

        Returns:
            Dictionary containing backtest metrics, the ledger DataFrame,
            and the leakage audit report.
        """
        logger.info("backtest_started", signals=len(signals), pricing_rows=len(pricing))

        # 1. Look-ahead bias elimination with calendar-aware date snapping
        lagged_signals = self._apply_filing_lag(signals)

        # 2. Filter for long signals (Top Conviction)
        if top_n_decile is None:
            threshold = None
            long_portfolio = lagged_signals
        else:
            if not 0.0 <= top_n_decile <= 1.0:
                raise BacktestError("top_n_decile must be between 0.0 and 1.0, or None.")
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

        # Handle survivorship bias: null exit price = -100% (delisted/bankrupt)
        trade_ledger = trade_ledger.with_columns(
            pl.col("fwd_return_raw").fill_null(-1.0)
        )

        # Alias entry_price as close_price for cost model compatibility
        if "close_price" not in trade_ledger.columns and "entry_price" in trade_ledger.columns:
            trade_ledger = trade_ledger.with_columns(pl.col("entry_price").alias("close_price"))

        # 4. Liquidity-bounded position sizing
        target_allocation_usd = 1_000_000.0
        trade_ledger = trade_ledger.with_columns(
            pl.col("volume_30d_avg").mul(pl.col("close_price")).alias("adtv_usd")
        ).with_columns(
            (pl.lit(target_allocation_usd) / pl.col("volatility_30d").clip(lower_bound=0.01))
            .clip(upper_bound=pl.col("adtv_usd") * self._cfg.execution.adv_participation_limit)
            .alias("position_size_usd")
        )

        # 5. ── LEAKAGE AUDIT (Phase 4.21) ── mandatory, non-bypassable ─────────
        audit_report: LeakageAuditReport = run_full_audit(
            signals=long_portfolio,
            pricing=pricing,
            ledger=trade_ledger,
            regime_ts=regime_ts,
            holding_period_days=self._hold_days,
        )

        # 6. Execution realism: T+1 fill, slippage, ADV cap (Phase 4.5)
        trade_ledger = self._execution.apply(trade_ledger, pricing)

        # Use T+1 entry price for return calculation if available
        if "entry_price_t1" in trade_ledger.columns:
            trade_ledger = trade_ledger.with_columns(
                pl.when(pl.col("entry_price_t1").is_not_null())
                .then(
                    (pl.col("exit_price") - pl.col("entry_price_t1")) / pl.col("entry_price_t1")
                )
                .otherwise(pl.col("fwd_return_raw"))
                .alias("fwd_return_raw")
            )

        # 7. Transaction costs
        trade_ledger = self._cost_model.apply_costs(trade_ledger)

        # 8. Diagnostics & Reporting
        metrics = regime_conditional_metrics(trade_ledger)
        overall_sharpe = calculate_sharpe(trade_ledger["net_fwd_return"])
        logger.info("backtest_completed", overall_sharpe=round(overall_sharpe, 2))

        return {
            "metrics_by_regime": metrics,
            "overall_sharpe": overall_sharpe,
            "ledger": trade_ledger,
            "survivorship_flags": trade_ledger.filter(pl.col("fwd_return_raw") == -1.0).height,
            "leakage_audit": audit_report,
        }
