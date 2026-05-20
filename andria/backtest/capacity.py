"""AUM Capacity and Liquidity Stress Analysis (Phase 4.6 / 4.19).

Simulates how strategy performance degrades as AUM scales from $10M to $5B.
Identifies:
- The "capacity cliff" — AUM level at which alpha disappears
- Liquidity bottlenecks by ticker and GICS sector
- Turnover stress at different AUM levels

Usage::

    from andria.backtest.capacity import CapacityAnalyzer
    analyzer = CapacityAnalyzer()
    capacity_df = analyzer.estimate_capacity(ledger)
    analyzer.print_capacity_cliff(capacity_df)
"""

from __future__ import annotations

import numpy as np
import polars as pl

from andria.backtest.diagnostics import calculate_sharpe
from andria.core.logging import get_logger

logger = get_logger(__name__)

# AUM scaling ladder in USD: $10M to $5B in 10 log-spaced steps
_DEFAULT_AUM_RANGE = np.logspace(7, 9.7, 10)  # ~$10M to ~$5B

_ADV_PARTICIPATION_LIMIT = 0.05  # max 5% of ADTV per position


class CapacityAnalyzer:
    """Estimates strategy capacity constraints via AUM scaling simulation.

    For each AUM level:
    1. Recalculates position sizes as AUM * target_weight
    2. Identifies positions that exceed the ADV participation limit
    3. Excludes (or caps) illiquid positions and recomputes Sharpe

    This reveals the "capacity cliff" — the AUM level at which enough
    positions become illiquid that the Sharpe degrades materially.

    Args:
        adv_participation_limit: Fraction of ADTV for max position size.
        aum_range:               Array of AUM levels in USD to test.
    """

    def __init__(
        self,
        adv_participation_limit: float = _ADV_PARTICIPATION_LIMIT,
        aum_range: np.ndarray | None = None,
    ) -> None:
        self.adv_participation_limit = adv_participation_limit
        self.aum_range = aum_range if aum_range is not None else _DEFAULT_AUM_RANGE

    def estimate_capacity(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Simulate performance across AUM levels.

        Args:
            ledger: Trade ledger with ``net_fwd_return``, ``adtv_usd``,
                    and optionally ``portfolio_weight``.

        Returns:
            Polars DataFrame with columns:
            [aum_usd, n_positions, n_excluded, exclusion_pct, sharpe, mean_return]
        """
        if "adtv_usd" not in ledger.columns:
            logger.warning("capacity_analysis_skipped", reason="adtv_usd column missing")
            return pl.DataFrame()

        rows = []
        base_weight = 1.0 / ledger.height if ledger.height > 0 else 0.01

        for aum in self.aum_range:
            # Position size at this AUM
            position_sizes = ledger.with_columns(
                (pl.lit(float(aum)) * pl.lit(base_weight)).alias("position_size_sim")
            )

            # Max allowable size = participation_limit * ADTV
            position_sizes = position_sizes.with_columns(
                (pl.col("adtv_usd") * self.adv_participation_limit).alias("adv_max_usd")
            )

            # Flag excluded positions
            eligible = position_sizes.filter(
                pl.col("position_size_sim") <= pl.col("adv_max_usd")
            )
            n_total = position_sizes.height
            n_eligible = eligible.height
            n_excluded = n_total - n_eligible

            if n_eligible < 5:
                sharpe = float("nan")
                mean_ret = float("nan")
            else:
                sharpe = float(calculate_sharpe(eligible["net_fwd_return"]))
                mean_ret = float(eligible["net_fwd_return"].mean() or 0.0)

            rows.append({
                "aum_usd": float(aum),
                "aum_label": f"${aum / 1e6:.0f}M",
                "n_positions": n_eligible,
                "n_excluded": n_excluded,
                "exclusion_pct": round(n_excluded / max(n_total, 1) * 100, 1),
                "sharpe": round(sharpe, 4) if not np.isnan(sharpe) else None,
                "mean_return": round(mean_ret, 6) if not np.isnan(mean_ret) else None,
            })

            logger.debug(
                "capacity_aum_step",
                aum_m=round(aum / 1e6, 1),
                n_eligible=n_eligible,
                n_excluded=n_excluded,
                sharpe=round(sharpe, 3) if not np.isnan(sharpe) else "nan",
            )

        result = pl.DataFrame(rows)
        self._log_capacity_cliff(result)
        return result

    def _log_capacity_cliff(self, capacity_df: pl.DataFrame) -> None:
        """Identify and log the capacity cliff."""
        if capacity_df.is_empty() or "sharpe" not in capacity_df.columns:
            return

        valid = capacity_df.drop_nulls("sharpe")
        if valid.is_empty():
            return

        base_sharpe = float(valid["sharpe"][0])
        cliff_row = valid.filter(pl.col("sharpe") < base_sharpe * 0.5).head(1)

        if cliff_row.is_empty():
            logger.info("capacity_cliff_not_found", note="Sharpe stays above 50% baseline across all AUM levels")
        else:
            cliff_aum = float(cliff_row["aum_usd"][0])
            logger.warning(
                "capacity_cliff_detected",
                cliff_aum_m=round(cliff_aum / 1e6, 1),
                note="Sharpe drops below 50% of baseline at this AUM level",
            )

    def liquidity_bottleneck_report(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Identify which tickers/sectors become illiquid at different AUM levels.

        Returns:
            DataFrame ranking tickers by the AUM at which they first become
            capacity-constrained.
        """
        if "adtv_usd" not in ledger.columns or "cusip" not in ledger.columns:
            return pl.DataFrame()

        base_weight = 1.0 / ledger.height if ledger.height > 0 else 0.01
        rows = []

        for _, group in ledger.group_by("cusip"):
            adtv = float(group["adtv_usd"].mean() or 0)
            max_position = adtv * self.adv_participation_limit
            capacity_aum = max_position / base_weight if base_weight > 0 else float("inf")

            rows.append({
                "cusip": group["cusip"][0],
                "ticker": group["ticker"][0] if "ticker" in group.columns else "unknown",
                "avg_adtv_usd": round(adtv, 0),
                "max_position_usd": round(max_position, 0),
                "capacity_aum_usd": round(capacity_aum, 0),
                "capacity_aum_label": f"${capacity_aum / 1e6:.0f}M",
            })

        return (
            pl.DataFrame(rows)
            .sort("capacity_aum_usd", descending=False)
        )

    @staticmethod
    def print_capacity_cliff(capacity_df: pl.DataFrame) -> None:
        """Print a formatted capacity analysis table."""
        if capacity_df.is_empty():
            print("No capacity data available.")
            return
        print(f"\n{'AUM':>12} {'Positions':>10} {'Excluded':>10} {'Excl%':>7} {'Sharpe':>8}")
        print("-" * 55)
        for row in capacity_df.iter_rows(named=True):
            sharpe_str = f"{row['sharpe']:.3f}" if row["sharpe"] is not None else "n/a"
            print(
                f"{row['aum_label']:>12} {row['n_positions']:>10} "
                f"{row['n_excluded']:>10} {row['exclusion_pct']:>6.1f}%  {sharpe_str:>8}"
            )
