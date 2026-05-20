"""Pytest configuration and shared fixtures for Andria Systems tests."""
from __future__ import annotations

from pathlib import Path
from typing import Generator

import duckdb
import polars as pl
import pytest

from andria.core.config import Settings


#Settings fixture

@pytest.fixture(scope="session")
def test_cfg() -> Settings:
    """Settings pointing at test data directories."""
    return Settings(
        paths={
            "raw_edgar": "tests/fixtures/raw/edgar",
            "raw_fred": "tests/fixtures/raw/fred",
            "raw_ofr": "tests/fixtures/raw/ofr",
            "processed": "tests/fixtures/processed",
            "artifacts": "tests/fixtures/artifacts",
        }
    )


# DuckDB in-memory fixture

@pytest.fixture
def duckdb_conn() -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """Yield a fresh in-memory DuckDB connection per test."""
    conn = duckdb.connect(":memory:")
    conn.execute("SET memory_limit = '2GB'")
    yield conn
    conn.close()


@pytest.fixture
def mock_edgar_conn(duckdb_conn: duckdb.DuckDBPyConnection) -> duckdb.DuckDBPyConnection:
    """DuckDB connection pre-loaded with a small synthetic EDGAR dataset."""
    duckdb_conn.execute("""
        CREATE TABLE edgar_core AS
        SELECT
            'MGR_' || (i % 100)::VARCHAR AS FILINGMANAGER_NAME,
            '202' || (i % 4)::VARCHAR || 'Q' || (1 + i % 4)::VARCHAR AS REPORTCALENDARORQUARTER,
            LPAD((i % 5000)::VARCHAR, 9, '0') AS CUSIP,
            (1000 + random() * 50000)::DOUBLE AS VALUE,
            (100 + random() * 10000)::DOUBLE AS SSHPRNAMT,
            CASE WHEN random() < 0.05 THEN 'Put'
                 WHEN random() < 0.03 THEN 'Call'
                 ELSE 'SH' END AS exposure_type,
            CASE WHEN random() < 0.02 THEN 'Put'
                 WHEN random() < 0.01 THEN 'Call'
                 ELSE NULL END AS PUTCALL,
            (random() * 1000)::DOUBLE AS VOTING_AUTH_SOLE,
            (random() * 200)::DOUBLE AS VOTING_AUTH_SHARED,
            CASE WHEN random() < 0.05 THEN 'true' ELSE 'false' END AS ISAMENDMENT
        FROM generate_series(1, 50000) t(i)
    """)
    return duckdb_conn


# Sample DataFrames
@pytest.fixture
def sample_manager_dna() -> pl.DataFrame:
    """Small synthetic Manager DNA DataFrame matching ManagerDNAContract."""
    import numpy as np
    rng = np.random.default_rng(42)
    n = 500
    return pl.DataFrame({
        "manager_name": [f"MGR_{i}" for i in range(n)],
        "avg_hhi": rng.uniform(0.01, 0.9, n).tolist(),
        "avg_put_ratio": rng.exponential(0.05, n).clip(0, 1).tolist(),
        "log_avg_aum": rng.normal(20, 3, n).tolist(),
        "avg_turnover": rng.uniform(0.05, 0.8, n).tolist(),
        "avg_conviction_delta": rng.normal(0, 0.1, n).tolist(),
        "new_position_rate": rng.uniform(0.0, 0.5, n).tolist(),
        "exit_rate": rng.uniform(0.0, 0.4, n).tolist(),
        "avg_holding_duration_qtrs": rng.uniform(1, 20, n).tolist(),
        "top5_concentration": rng.uniform(0.1, 0.9, n).tolist(),
        "options_notional_ratio": rng.exponential(0.03, n).clip(0, 1).tolist(),
        "shared_vote_ratio": rng.uniform(0.0, 0.5, n).tolist(),
        "amendment_rate": rng.exponential(0.02, n).clip(0, 1).tolist(),
        "quarters_active": rng.integers(4, 80, n).tolist(),
        "aum_volatility": rng.exponential(1000, n).tolist(),
    }).with_columns([
        pl.col("quarters_active").cast(pl.Int32),
    ])
