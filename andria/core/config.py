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

import uuid
from datetime import UTC, datetime
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


# Phase 4 Config Sub-models
class MarketDataConfig(BaseModel):
    """Real market data integration settings (Phase 4.1)."""

    cache_dir: Path = PROJECT_ROOT / "dataset/processed/market"
    cusip_map_path: Path = PROJECT_ROOT / "dataset/processed/cusip_ticker_map.parquet"
    max_tickers_per_batch: int = 100
    request_delay_seconds: float = 0.5
    start_date: str = "2000-01-01"
    adj_close_only: bool = True
    stale_threshold_days: int = 5  # flag data older than N trading days

    @model_validator(mode="after")
    def _make_absolute(self) -> MarketDataConfig:
        if not self.cache_dir.is_absolute():
            self.cache_dir = PROJECT_ROOT / self.cache_dir
        if not self.cusip_map_path.is_absolute():
            self.cusip_map_path = PROJECT_ROOT / self.cusip_map_path
        return self

    model_config = {"arbitrary_types_allowed": True}


class ExecutionConfig(BaseModel):
    """Execution realism parameters (Phase 4.5 V1)."""

    fill_delay_days: int = 1         # T+1 open entry, most impactful realism fix
    adv_participation_limit: float = 0.05  # cap positions at 5% of ADTV
    execution_mode: str = "market"   # "market" | "vwap"
    vwap_slippage_discount: float = 0.5   # fraction of slippage saved via VWAP


class ExperimentConfig(BaseModel):
    """Research governance and reproducibility (Phase 4.16)."""

    seed: int = 42
    mlflow_tracking_uri: str = "artifacts/mlflow"
    mlflow_experiment_name: str = "andria_phase4"


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
    # Phase 4 additions
    market_data: MarketDataConfig = MarketDataConfig()
    execution: ExecutionConfig = ExecutionConfig()
    experiment: ExperimentConfig = ExperimentConfig()

    run_id: str = Field(
        default_factory=lambda: datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + "_" + uuid.uuid4().hex[:6]
    )

    @classmethod
    def from_yaml(cls, path: Path | None = None) -> Settings:
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
