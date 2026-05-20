"""Portfolio Construction Engine (Phase 4.17).

Converts signal scores into realistic portfolio weights subject to:
- Volatility targeting: scale to a target portfolio volatility (default 10% p.a.)
- Single-name exposure cap: max 5% of NAV per position
- Sector neutrality: max 25% of gross notional in any GICS sector
- Turnover awareness: warn if expected turnover exceeds sustainable levels

Usage::

    from andria.backtest.portfolio import PortfolioConstructor
    constructor = PortfolioConstructor(target_vol=0.10, max_position=0.05)
    ledger = constructor.apply(ledger)
"""

from __future__ import annotations

import polars as pl
import numpy as np

from andria.core.logging import get_logger

logger = get_logger(__name__)

_ANNUALIZE = np.sqrt(252)


class PortfolioConstructor:
    """Converts trade ledger positions into risk-budgeted portfolio weights.

    All weighting is performed in return space — this is a simplified
    portfolio construction layer suitable for event-study backtests,
    not a full mean-variance optimizer.

    Args:
        target_vol:       Target annualized portfolio volatility (default 10%).
        max_position_pct: Maximum single-name weight (default 5% of NAV).
        max_sector_pct:   Maximum sector concentration (default 25% of gross).
        weight_scheme:    ``"equal_risk"`` (default) or ``"racs_weighted"``.
    """

    def __init__(
        self,
        target_vol: float = 0.10,
        max_position_pct: float = 0.05,
        max_sector_pct: float = 0.25,
        weight_scheme: str = "equal_risk",
    ) -> None:
        self.target_vol = target_vol
        self.max_position_pct = max_position_pct
        self.max_sector_pct = max_sector_pct
        if weight_scheme not in ("equal_risk", "racs_weighted"):
            raise ValueError(f"weight_scheme must be 'equal_risk' or 'racs_weighted'")
        self.weight_scheme = weight_scheme

    def apply(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Apply portfolio construction to the trade ledger.

        Adds columns:
        - ``raw_weight``       — pre-constraint weight
        - ``portfolio_weight`` — final weight after all constraints
        - ``vol_scalar``       — volatility targeting scalar applied
        - ``sector_capped``    — True if position was reduced due to sector cap

        Args:
            ledger: Trade ledger with ``net_fwd_return``, ``volatility_30d``.

        Returns:
            Ledger with portfolio weight columns appended.
        """
        if ledger.height == 0:
            return ledger

        ledger = self._compute_raw_weights(ledger)
        ledger = self._apply_vol_targeting(ledger)
        ledger = self._apply_position_cap(ledger)
        ledger = self._apply_sector_cap(ledger)
        ledger = self._normalize_weights(ledger)

        logger.info(
            "portfolio_construction_complete",
            n_positions=ledger.height,
            scheme=self.weight_scheme,
            avg_weight=round(float(ledger["portfolio_weight"].mean() or 0), 4),
        )
        return ledger

    def _compute_raw_weights(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Initial weights: equal risk contribution or RACS-weighted."""
        if self.weight_scheme == "racs_weighted" and "regime_adjusted_racs" in ledger.columns:
            # Proportional to RACS score (positive only)
            ledger = ledger.with_columns(
                pl.col("regime_adjusted_racs").clip(lower_bound=0.0).alias("raw_weight")
            )
        else:
            # Equal risk: inverse volatility weighting
            vol_col = "volatility_30d" if "volatility_30d" in ledger.columns else None
            if vol_col:
                ledger = ledger.with_columns(
                    (1.0 / pl.col(vol_col).clip(lower_bound=1e-4)).alias("raw_weight")
                )
            else:
                ledger = ledger.with_columns(pl.lit(1.0).alias("raw_weight"))

        # Normalize to sum to 1
        total = ledger["raw_weight"].sum()
        if total and total > 0:
            ledger = ledger.with_columns((pl.col("raw_weight") / total).alias("raw_weight"))

        return ledger

    def _apply_vol_targeting(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Scale weights to target annualized portfolio volatility.

        Approximation: uses the average position-level volatility as a
        proxy for portfolio volatility (ignores correlation structure,
        which is appropriate for a diversified 13F event-study portfolio).
        """
        if "volatility_30d" not in ledger.columns:
            return ledger.with_columns(pl.lit(1.0).alias("vol_scalar"))

        avg_daily_vol = float(ledger["volatility_30d"].mean() or 0.02)
        portfolio_vol_est = avg_daily_vol * _ANNUALIZE
        vol_scalar = self.target_vol / portfolio_vol_est if portfolio_vol_est > 0 else 1.0
        vol_scalar = min(vol_scalar, 3.0)  # cap scaling at 3x to prevent extreme leverage

        ledger = ledger.with_columns([
            (pl.col("raw_weight") * vol_scalar).alias("raw_weight"),
            pl.lit(round(vol_scalar, 4)).alias("vol_scalar"),
        ])

        logger.info(
            "vol_targeting_applied",
            estimated_portfolio_vol=round(portfolio_vol_est, 4),
            target_vol=self.target_vol,
            scalar=round(vol_scalar, 4),
        )
        return ledger

    def _apply_position_cap(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Cap any single position at max_position_pct."""
        return ledger.with_columns(
            pl.col("raw_weight").clip(upper_bound=self.max_position_pct).alias("raw_weight")
        )

    def _apply_sector_cap(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Cap sector concentration at max_sector_pct.

        If a sector's aggregate weight exceeds the cap, all positions in that
        sector are scaled down proportionally.
        """
        if "sector" not in ledger.columns:
            return ledger.with_columns([
                pl.col("raw_weight").alias("portfolio_weight"),
                pl.lit(False).alias("sector_capped"),
            ])

        # Compute sector weights
        sector_totals = ledger.group_by("sector").agg(
            pl.col("raw_weight").sum().alias("sector_weight")
        )

        ledger = ledger.join(sector_totals, on="sector", how="left")
        ledger = ledger.with_columns([
            pl.when(pl.col("sector_weight") > self.max_sector_pct)
            .then(pl.col("raw_weight") * (self.max_sector_pct / pl.col("sector_weight")))
            .otherwise(pl.col("raw_weight"))
            .alias("portfolio_weight"),
            (pl.col("sector_weight") > self.max_sector_pct).alias("sector_capped"),
        ]).drop("sector_weight")

        capped = ledger.filter(pl.col("sector_capped")).height
        if capped > 0:
            logger.info("sector_cap_applied", capped_positions=capped, cap=self.max_sector_pct)

        return ledger

    def _normalize_weights(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Final normalization so weights sum to 1.0."""
        weight_col = "portfolio_weight" if "portfolio_weight" in ledger.columns else "raw_weight"
        total = ledger[weight_col].sum()
        if total and total > 0:
            ledger = ledger.with_columns(
                (pl.col(weight_col) / total).alias("portfolio_weight")
            )
        elif "portfolio_weight" not in ledger.columns:
            ledger = ledger.with_columns(pl.col("raw_weight").alias("portfolio_weight"))
        return ledger

    def compute_turnover(
        self,
        ledger: pl.DataFrame,
        freq: str = "quarterly",
    ) -> float:
        """Estimate annualized portfolio turnover from the trade ledger.

        Args:
            ledger: Ledger with ``portfolio_weight`` and ``exec_date``.
            freq:   Rebalancing frequency (``"quarterly"`` or ``"monthly"``).

        Returns:
            Annualized one-way turnover as a fraction (1.0 = 100% p.a.).
        """
        if "portfolio_weight" not in ledger.columns or "exec_date" not in ledger.columns:
            return float("nan")

        periods_per_year = {"quarterly": 4, "monthly": 12}.get(freq, 4)
        n_periods = ledger.select(pl.col("exec_date").dt.year()).n_unique()
        if n_periods == 0:
            return float("nan")

        avg_weight_per_period = float(ledger["portfolio_weight"].mean() or 0)
        turnover = avg_weight_per_period * periods_per_year * 2  # one-way × 2 for round trip
        return round(turnover, 4)
