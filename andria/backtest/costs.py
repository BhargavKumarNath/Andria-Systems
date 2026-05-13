"""Transaction cost and market impact modeling.

Peak memory approx: < 100 MB (pure vectorized Polars operations).
"""

from __future__ import annotations
import polars as pl
from andria.core.config import get_settings


class TransactionCostModel:
    """Calculates slippage, fixed fees, and non-linear market impact."""

    def __init__(self) -> None:
        self._cfg = get_settings().backtest.costs

    def apply_costs(
        self,
        df: pl.DataFrame,
        trade_size_usd: float = 1_000_000.0,
    ) -> pl.DataFrame:
        """Applies transaction costs based on liquidity and capitalization.

        Formulas:
        - Fixed: 20 bps for Large Cap, 50 bps for Small Cap.
        - Impact: gamma * volatility * sqrt(Trade Size / ADTV)

        Args:
            df: Polars DataFrame containing 'close_price', 'volume_30d_avg', 'volatility_30d'.
            trade_size_usd: Assumed allocation per position in USD.

        Returns:
            DataFrame with 'exec_cost_bps' and 'net_fwd_return' appended.
            
        Raises:
            ValueError: If required columns for cost calculation are missing.
        """
        req_cols = {"close_price", "volume_30d_avg", "volatility_30d", "fwd_return_raw"}
        if not req_cols.issubset(set(df.columns)):
            raise ValueError(f"Missing columns for cost model. Required: {req_cols}")

        trade_col = pl.col("position_size_usd") if "position_size_usd" in df.columns else pl.lit(trade_size_usd)

        return df.with_columns(
            # 1. ADTV Proxy (Average Daily Traded Volume in USD)
            pl.col("volume_30d_avg").mul(pl.col("close_price")).alias("adtv_usd")
        ).with_columns(
            # 2. Fixed Cost Tier (Large cap vs Small cap based on ADTV proxy)
            pl.when(pl.col("adtv_usd") > (self._cfg.small_cap_threshold_usd / 252))
            .then(self._cfg.large_cap_bps)
            .otherwise(self._cfg.small_cap_bps)
            .alias("fixed_cost_bps"),
            
            # 3. Square-root market impact (bounded to avoid div by zero)
            (
                pl.lit(self._cfg.market_impact_gamma)
                * pl.col("volatility_30d")
                * (trade_col / pl.col("adtv_usd").clip(lower_bound=1.0)).sqrt()
            )
            .fill_nan(self._cfg.small_cap_bps * 2)  # Fallback for illiquid/missing data
            .clip(upper_bound=0.05)  # Cap impact at 500 bps to prevent extreme outliers
            .alias("market_impact_bps"),
        ).with_columns(
            # 4. Total Execution Cost (Entry + Exit = 2x cost)
            (pl.col("fixed_cost_bps") + pl.col("market_impact_bps")).mul(2).alias("total_exec_cost")
        ).with_columns(
            # 5. Net Return
            (pl.col("fwd_return_raw") - pl.col("total_exec_cost")).alias("net_fwd_return")
        )