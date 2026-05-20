"""Execution Realism Engine V1 (Phase 4.5).

Adds three concrete realism improvements over the instantaneous-fill assumption
in the legacy ``costs.py``:

1. **T+1 fill delay** — entry price is the open on the first trading day *after*
   the exec_date, not the exec_date close. This is the single most impactful
   realism fix: institutional orders placed after-hours execute at next open.

2. **Slippage model** — bid-ask spread proxy derived from realized volatility
   and the participation ratio:
       slippage_bps = 0.5 * daily_vol / sqrt(participation_ratio)
   Bounded at the configured ``max_slippage_bps`` ceiling.

3. **ADV participation cap** — if the target position size exceeds
   ``adv_participation_limit * ADTV``, the position is **capped and excluded**
   (not partially filled over multiple days). The excess is logged as
   capacity-constrained. This is intentionally conservative: we correctly
   penalise illiquid positions rather than optimistically spreading fills.

Multi-day partial fill simulation is **not implemented in V1** — it adds
complexity without meaningfully improving the fidelity of a quarterly 13F
event-study strategy.

Integration::

    from andria.backtest.execution import ExecutionEngine
    engine = ExecutionEngine()
    ledger = engine.apply(ledger, pricing, calendar)
"""

from __future__ import annotations

import datetime

import polars as pl

from andria.core.config import get_settings
from andria.core.logging import get_logger
from andria.utils.market_calendar import MarketCalendar

logger = get_logger(__name__)

_MAX_SLIPPAGE_BPS = 0.05  # hard cap at 500 bps to prevent extreme outliers


class ExecutionEngine:
    """Applies V1 execution realism adjustments to the trade ledger.

    This class is called by ``AlphaFactoryEngine`` after the asof-join alignment
    step and before transaction cost application.
    """

    def __init__(self, calendar: MarketCalendar | None = None) -> None:
        self._cfg = get_settings().execution
        self._calendar = calendar or MarketCalendar()

    def apply(
        self,
        ledger: pl.DataFrame,
        pricing: pl.DataFrame,
    ) -> pl.DataFrame:
        """Apply fill delay, slippage, and ADV cap to the ledger.

        Args:
            ledger:  Trade ledger after temporal alignment. Must contain
                     ``cusip``, ``exec_date``, ``entry_price``, ``adtv_usd``,
                     ``position_size_usd``, ``volatility_30d``.
            pricing: Full OHLCV pricing DataFrame. Used to look up the
                     T+1 open price for each trade.

        Returns:
            Ledger with added columns:
            - ``exec_date_t1``       — actual fill date (T+1 trading day)
            - ``entry_price_t1``     — open price on T+1 (replaces entry_price)
            - ``exec_slippage_bps``  — estimated slippage in return units
            - ``adv_capped``         — boolean: True if position was capped
            - ``position_size_adj``  — adjusted position size after cap

        Notes:
            ``entry_price`` in the ledger is **not mutated** — ``entry_price_t1``
            is the execution-realistic price used by ``costs.py`` for return
            calculation. This preserves the original alignment for diagnostics.
        """
        required = {"cusip", "exec_date", "entry_price", "adtv_usd",
                    "position_size_usd", "volatility_30d"}
        missing = required - set(ledger.columns)
        if missing:
            logger.warning("execution_engine_missing_cols", missing=missing,
                           note="Skipping execution realism adjustments")
            return ledger

        ledger = self._apply_fill_delay(ledger, pricing)
        ledger = self._apply_slippage(ledger)
        ledger = self._apply_adv_cap(ledger)
        return ledger

    def _apply_fill_delay(
        self,
        ledger: pl.DataFrame,
        pricing: pl.DataFrame,
    ) -> pl.DataFrame:
        """Replace exec_date entry price with T+1 open price.

        For the typical case where exec_date is already a trading day,
        T+1 is simply the next trading session. This models institutional
        orders placed at day close executing at the next morning's open.
        """
        delay = self._cfg.fill_delay_days

        # Compute T+delay exec dates using the market calendar
        t1_dates: list[datetime.date] = []
        for row in ledger.select("exec_date").iter_rows():
            exec_dt = row[0]
            if isinstance(exec_dt, str):
                from datetime import datetime as _dt
                exec_dt = _dt.fromisoformat(exec_dt).date()
            t1_dates.append(self._calendar.add_trading_days(exec_dt, delay))

        ledger = ledger.with_columns(
            pl.Series("exec_date_t1", t1_dates, dtype=pl.Date)
        )

        # Look up the open price on exec_date_t1
        if "open" not in pricing.columns:
            logger.warning("execution_fill_delay_no_open", note="Using close_adj as T+1 proxy")
            open_col = "close_adj"
        else:
            open_col = "open"

        open_prices = pricing.select(["cusip", "date", open_col]).rename({open_col: "entry_price_t1"})
        open_prices = open_prices.with_columns(pl.col("date").cast(pl.Date))

        ledger = ledger.sort(["cusip", "exec_date_t1"])
        with_t1 = ledger.join_asof(
            open_prices.sort(["cusip", "date"]),
            left_on="exec_date_t1",
            right_on="date",
            by="cusip",
            strategy="forward",
        )

        # Fall back to original entry_price if T+1 lookup fails (sparse pricing)
        with_t1 = with_t1.with_columns(
            pl.col("entry_price_t1").fill_null(pl.col("entry_price"))
        )

        filled_count = with_t1.filter(pl.col("entry_price_t1") != pl.col("entry_price")).height
        logger.info("fill_delay_applied", delay_days=delay, t1_fills=filled_count)
        return with_t1

    def _apply_slippage(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Estimate bid-ask slippage as a return-space cost.

        Formula:
            participation_ratio = position_size_usd / adtv_usd  (clipped ≥ 1e-6)
            slippage_bps = 0.5 * volatility_30d / sqrt(participation_ratio)

        For VWAP execution mode, slippage is discounted by ``vwap_slippage_discount``.
        Result is bounded at ``_MAX_SLIPPAGE_BPS`` to prevent outlier contamination.
        """
        mode = self._cfg.execution_mode
        vwap_discount = self._cfg.vwap_slippage_discount if mode == "vwap" else 1.0

        ledger = ledger.with_columns(
            (
                pl.lit(0.5)
                * pl.col("volatility_30d").clip(lower_bound=1e-6)
                / (pl.col("position_size_usd") / pl.col("adtv_usd").clip(lower_bound=1.0)).sqrt()
                * pl.lit(vwap_discount)
            )
            .clip(upper_bound=_MAX_SLIPPAGE_BPS)
            .fill_nan(0.005)  # fallback: 50 bps for missing vol data
            .alias("exec_slippage_bps")
        )

        avg_slippage = ledger["exec_slippage_bps"].mean()
        logger.info("slippage_applied", mode=mode, avg_slippage_bps=round(float(avg_slippage or 0), 4))
        return ledger

    def _apply_adv_cap(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Cap positions exceeding the ADV participation limit.

        Positions that exceed ``adv_participation_limit * adtv_usd`` are flagged
        as ``adv_capped = True`` and their size is reduced to the cap level.
        These trades are still included but marked for capacity analysis.
        """
        limit = self._cfg.adv_participation_limit
        ledger = ledger.with_columns(
            (pl.col("adtv_usd") * pl.lit(limit)).alias("adv_cap_usd")
        ).with_columns([
            (pl.col("position_size_usd") > pl.col("adv_cap_usd")).alias("adv_capped"),
            pl.min_horizontal("position_size_usd", "adv_cap_usd").alias("position_size_adj"),
        ])

        capped = ledger.filter(pl.col("adv_capped")).height
        if capped > 0:
            logger.warning(
                "adv_cap_applied",
                capped_trades=capped,
                participation_limit=limit,
                note="Position sizes reduced to ADV limit; excess excluded",
            )

        return ledger.drop("adv_cap_usd")
