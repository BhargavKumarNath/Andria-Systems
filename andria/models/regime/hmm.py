"""Macro Regime Hidden Markov Model — stable semantic mapping via cosine similarity.

"""
from __future__ import annotations

import polars as pl

from andria.core.config import Settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


class MacroRegimeDetector:
    """Fits a Gaussian HMM to FRED/OFR macro features with stable semantic labeling.
    """

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

    def fit_predict(self) -> pl.DataFrame:
        """Fit HMM on FRED/OFR features, return regime time series DataFrame.

        Returns DataFrame with: date, regime_id, regime_label, regime_prob,
        plus one column per regime label with its state probability.
        """
        raise NotImplementedError("Implemented in Step 2 — Phase 2 refactor")
