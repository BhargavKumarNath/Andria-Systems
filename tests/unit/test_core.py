"""Unit tests for core infrastructure."""
from __future__ import annotations

import polars as pl
import pytest

from andria.core.config import get_settings
from andria.core.exceptions import DataContractError, DataNotFoundError
from andria.core.schemas import ManagerDNAContract


def test_settings_loads() -> None:
    cfg = get_settings(reload=True)
    assert cfg.clustering.algorithm == "hdbscan"
    assert cfg.hmm.n_components == 4
    assert len(cfg.clustering.min_cluster_size_sweep) > 0


def test_settings_hmm_prototypes() -> None:
    cfg = get_settings()
    assert "Goldilocks" in cfg.hmm.regime_prototypes
    assert "Recession_Fear" in cfg.hmm.regime_prototypes
    for label, vec in cfg.hmm.regime_prototypes.items():
        assert len(vec) == len(cfg.hmm.features), f"Prototype {label} dimension mismatch"


def test_data_contract_missing_column(sample_manager_dna: pl.DataFrame) -> None:
    bad_df = sample_manager_dna.drop("avg_hhi")
    with pytest.raises(DataContractError, match="avg_hhi"):
        ManagerDNAContract.validate(bad_df)


def test_data_contract_valid(sample_manager_dna: pl.DataFrame) -> None:
    validated = ManagerDNAContract.validate(sample_manager_dna)
    assert validated.shape == sample_manager_dna.shape


def test_data_not_found_error() -> None:
    with pytest.raises(DataNotFoundError):
        raise DataNotFoundError("/nonexistent/path.parquet")
