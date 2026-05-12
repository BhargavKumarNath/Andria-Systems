"""Manager DNA feature engineering — 15 behavioral features from raw 13F data.

"""
from __future__ import annotations

import polars as pl

from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory, db_factory
from andria.core.logging import get_logger

logger = get_logger(__name__)


class ManagerDNABuilder:
    """Builds 15-feature Manager DNA from the EDGAR Hive-partitioned parquet.

    Features computed (all derived from raw 13F quarterly filings):
        1.  avg_hhi                  — Portfolio concentration (Herfindahl-Hirschman Index)
        2.  avg_put_ratio            — Options hedging posture (put value / total AUM)
        3.  log_avg_aum              — Fund scale (log of average quarterly AUM)
        4.  avg_turnover             — Average QoQ absolute weight change (trading frequency)
        5.  avg_conviction_delta     — Trend of HHI over time (conviction growing/shrinking)
        6.  new_position_rate        — Fraction of quarters with new position initiations
        7.  exit_rate                — Fraction of quarters with full position exits
        8.  avg_holding_duration_qtrs — Average quarters held per CUSIP position
        9.  top5_concentration       — Sum of top-5 position weights
        10. options_notional_ratio   — Options notional / total equity notional
        11. shared_vote_ratio        — Shared voting authority / total voting authority
        12. amendment_rate           — Fraction of filings marked as amendments
        13. quarters_active          — Total quarters with filings
        14. aum_volatility           — Std dev of quarterly AUM (mandate stability)
        15. sector_hhi               — Sector-level concentration (requires CUSIP→sector map)
    """

    def __init__(
        self,
        cfg: Settings,
        factory: DuckDBConnectionFactory | None = None,
    ) -> None:
        self._cfg = cfg
        self._factory = factory or db_factory

    def build(self) -> pl.DataFrame:
        """Run full feature engineering pipeline. Returns validated ManagerDNA DataFrame."""
        raise NotImplementedError("Implemented in Step 2 — Phase 1 refactor")
