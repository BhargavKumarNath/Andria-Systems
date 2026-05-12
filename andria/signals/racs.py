"""RACS v2 — Regime-Conditioned Activist Conviction Score.

Implemented in Step 2. Stub defines the public API.
"""
from __future__ import annotations

import polars as pl

from andria.core.config import Settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


class RACSEngine:
    """Computes regime-conditioned RACS signals from EDGAR + clustering artifacts.

    v2 improvements over v1:
    - Cluster-agnostic: activist archetype identified by label, not hardcoded cluster_id
    - Crowding penalty uses Gini coefficient of institutional ownership, not raw fund count
    - Regime conditioning: racs_raw * (1 + regime_weight * regime_confidence)
    - Signal IC computed quarterly for quality monitoring
    - Full DuckDB vectorised pipeline — no Python loops on rows
    """

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

    def compute(self, regime_df: pl.DataFrame) -> pl.DataFrame:
        """Compute RACS signals joined with regime probabilities.

        Args:
            regime_df: Output of MacroRegimeDetector.fit_predict()

        Returns:
            DataFrame conforming to RACSContract schema.
        """
        raise NotImplementedError("Implemented in Step 2 — Phase 2 refactor")
