"""Dashboard data service — loads real pipeline artifacts with caching."""

from __future__ import annotations
import polars as pl
from andria.core.config import Settings
from andria.core.logging import get_logger
from andria.ingestion.registry import DatasetRegistry

logger = get_logger(__name__)


class DashboardDataService:
    """Loads and caches real pipeline artifacts for dashboard consumption.

    All methods raise DataNotFoundError if the required artifact doesn't exist
    — the dashboard shows a data-health warning card instead of fake data.
    """

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg
        self._registry = DatasetRegistry(cfg)

    def load_clustered_managers(self) -> pl.DataFrame:
        """Returns clustered manager DNA with archetype labels and UMAP coordinates."""
        path = self._registry.require(self._registry.clustered_managers)
        return pl.read_parquet(path)

    def load_racs_signals(self, top_n: int | None = None) -> pl.DataFrame:
        """Returns RACS signals sorted by regime-adjusted score descending."""
        path = self._registry.require(self._registry.racs_signals)
        df = pl.read_parquet(path).sort("regime_adjusted_racs", descending=True)
        if top_n:
            df = df.head(top_n)
        return df

    def load_regime_series(self) -> pl.DataFrame:
        """Returns HMM regime time series with state probabilities."""
        path = self._registry.require(self._registry.regime_series)
        return pl.read_parquet(path)

    def load_system_health(self) -> dict[str, object]:
        """Returns real data health metrics from artifact manifests."""
        raise NotImplementedError("Implemented in Step 3")

    def pipeline_status(self) -> dict[str, bool]:
        """Returns which pipeline stages have completed."""
        return {
            "ingested": self._registry.is_ingested(),
            "phase1": self._registry.is_phase1_complete(),
            "phase2": self._registry.is_phase2_complete(),
        }
