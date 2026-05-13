"""Centralised configuration via Pydantic Settings.

All pipeline parameters, paths, and hyperparameters are defined here.
Values are loaded from configs/base.yaml and can be overridden by
environment variables prefixed with ANDRIA_ (e.g. ANDRIA_DASHBOARD__PORT=9000).

Usage:
    from andria.core.config import get_settings
    cfg = get_settings()
    print(cfg.paths.processed)
"""

from __future__ import annotations
from pathlib import Path
from typing import Any
import yaml
from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).parents[2]


# Sub-models


class PathsConfig(BaseModel):
    raw_edgar: Path = PROJECT_ROOT / "dataset/raw/edgar"
    raw_fred: Path = PROJECT_ROOT / "dataset/raw/fred"
    raw_ofr: Path = PROJECT_ROOT / "dataset/raw/ofr"
    processed: Path = PROJECT_ROOT / "dataset/processed"
    artifacts: Path = PROJECT_ROOT / "artifacts"
    
    @model_validator(mode="after")
    def _make_absolute(self) -> PathsConfig:
        for field in ["raw_edgar", "raw_fred", "raw_ofr", "processed", "artifacts"]:
            val = getattr(self, field)
            if not val.is_absolute():
                setattr(self, field, PROJECT_ROOT / val)
        return self

    model_config = {"arbitrary_types_allowed": True}


class IngestConfig(BaseModel):
    memory_limit_gb: int = 10
    parquet_compression: str = "zstd"
    row_group_size: int = 100_000
    partition_edgar: bool = True
    min_valid_date: str = "2004-01-01"


class ManagerDNAConfig(BaseModel):
    min_quarters_active: int = 4
    top_n_concentration: int = 5
    options_value_col: str = "Put"


class FeaturesConfig(BaseModel):
    manager_dna: ManagerDNAConfig = ManagerDNAConfig()


class UMAPConfig(BaseModel):
    n_components: int = 2
    n_neighbors: int = 30
    min_dist: float = 0.1
    metric: str = "euclidean"
    random_state: int = 42


class ClusteringConfig(BaseModel):
    algorithm: str = "hdbscan"
    min_cluster_size_sweep: list[int] = [50, 100, 150, 200, 300]
    min_samples_ratio: float = 0.25
    cluster_selection_epsilon: float = 0.0
    random_state: int = 42
    umap: UMAPConfig = UMAPConfig()


class HMMConfig(BaseModel):
    n_components: int = 4
    covariance_type: str = "full"
    n_iter: int = 1000
    random_state: int = 42
    features: list[str] = [
        "vix_level",
        "yield_spread_10y2y",
        "credit_spread_hy",
        "fed_funds_delta",
        "ofr_stress_index",
    ]
    regime_prototypes: dict[str, list[float]] = {
        "Goldilocks": [-1.2, 0.5, -0.8, -0.3, -1.0],
        "Recovery": [-0.3, 0.2, -0.1, 0.5, -0.3],
        "Rate_Shock": [0.5, -1.5, 0.3, 1.8, 0.5],
        "Recession_Fear": [2.0, -0.5, 2.0, -1.0, 2.0],
    }


class RACSConfig(BaseModel):
    lambda_decay: float = 0.05
    min_activist_buyers: int = 2
    conviction_quantile_threshold: float = 0.75
    regime_weight: float = 0.3


class SignalsConfig(BaseModel):
    racs: RACSConfig = RACSConfig()

class BacktestCostsConfig(BaseModel):
    large_cap_bps: float = 0.0020  # 20 bps for large cap
    small_cap_threshold_usd: float = 2_000_000_000.0
    small_cap_bps: float = 0.0050  # 50 bps for small cap
    market_impact_gamma: float = 0.1  # Square root impact model coefficient

class SignificanceConfig(BaseModel):
    """Statistical significance parameters for FDR/Benjamini-Hochberg"""
    fdr_alpha: float = 0.05
    min_obs_per_regime: int = 30

class BacktestConfig(BaseModel):
    costs: BacktestCostsConfig = BacktestCostsConfig()
    significance: SignificanceConfig = SignificanceConfig()
    filing_lag_days: int = 45
    holding_period_days: int = 90
    top_n_decile: float = 0.1

class DashboardConfig(BaseModel):
    port: int = 8050
    debug: bool = False
    cache_timeout_seconds: int = 300
    max_rows_table: int = 500
    theme: str = "CYBORG"


# Root Settings
class Settings(BaseSettings):
    """Root settings object. Load once via get_settings()."""

    model_config = SettingsConfigDict(
        env_prefix="ANDRIA_",
        env_nested_delimiter="__",
        env_file=str(PROJECT_ROOT / ".env"),
        extra="ignore",
    )

    project_root: Path = Field(default=PROJECT_ROOT)
    paths: PathsConfig = PathsConfig()
    ingest: IngestConfig = IngestConfig()
    features: FeaturesConfig = FeaturesConfig()
    clustering: ClusteringConfig = ClusteringConfig()
    hmm: HMMConfig = HMMConfig()
    signals: SignalsConfig = SignalsConfig()
    backtest: BacktestConfig = BacktestConfig()
    dashboard: DashboardConfig = DashboardConfig()

    @classmethod
    def from_yaml(cls, path: Path | None = None) -> "Settings":
        """Load settings from YAML, then apply env-var overrides."""
        yaml_path = path or (PROJECT_ROOT / "configs" / "base.yaml")
        raw: dict[str, Any] = {}
        if yaml_path.exists():
            with open(yaml_path) as fh:
                raw = yaml.safe_load(fh) or {}
        return cls.model_validate(raw)


_settings: Settings | None = None


def get_settings(reload: bool = False) -> Settings:
    """Return the singleton Settings instance (lazy-loaded from YAML)."""
    global _settings
    if _settings is None or reload:
        _settings = Settings.from_yaml()
    return _settings
