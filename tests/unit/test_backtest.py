"""Tests for the Alpha Factory Engine and Look-Ahead Bias Elimination."""

from __future__ import annotations
import os
from datetime import date
import polars as pl
import psutil
import pytest
from andria.backtest.costs import TransactionCostModel
from andria.backtest.diagnostics import benjamini_hochberg_fdr
from andria.backtest.engine import AlphaFactoryEngine


@pytest.fixture
def mock_signals() -> pl.DataFrame:
    """Mock RACS Signals dataframe from Phase 2."""
    return pl.DataFrame({
        "quarter": ["2023Q1", "2023Q2", "2023Q3"],
        "cusip": ["AAPL", "AAPL", "MSFT"],
        "regime_adjusted_racs": [0.95, 0.85, 0.99],
        "regime_label": ["Goldilocks", "Rate Shock", "Goldilocks"]
    })


@pytest.fixture
def mock_pricing() -> pl.DataFrame:
    """Mock Pricing dataframe mimicking CRSP/Tiingo structure."""
    dates = [date(2023, 5, 15), date(2023, 8, 14), date(2023, 8, 15), 
             date(2023, 11, 14), date(2023, 11, 15)]
    
    # AAPL goes up, MSFT goes down
    aapl_prices = [150.0, 165.0, 166.0, 170.0, 172.0]
    msft_prices = [300.0, 310.0, 312.0, 290.0, 288.0]
    
    return pl.DataFrame({
        "cusip": ["AAPL"] * 5 + ["MSFT"] * 5,
        "date": dates * 2,
        "close_adj": aapl_prices + msft_prices, 
        "close_price": aapl_prices + msft_prices,
        "volume_30d_avg": [50_000_000.0] * 10,
        "volatility_30d": [0.015] * 10,
    })


def test_look_ahead_bias_elimination(mock_signals: pl.DataFrame):
    """CRITICAL: Ensure 45-day lag is mathematically exact."""
    engine = AlphaFactoryEngine()
    lagged = engine._apply_filing_lag(mock_signals)
    
    # Q1 ends March 31. + 45 days = May 15.
    q1_row = lagged.filter(pl.col("quarter") == "2023Q1")
    assert q1_row["exec_date"][0] == date(2023, 5, 15)
    
    # Q2 ends June 30. + 45 days = Aug 14.
    q2_row = lagged.filter(pl.col("quarter") == "2023Q2")
    assert q2_row["exec_date"][0] == date(2023, 8, 14)


def test_transaction_cost_model(mock_pricing: pl.DataFrame):
    """Ensure small cap vs large cap bps bounds are respected."""
    model = TransactionCostModel()
    
    # Fake raw return
    df = mock_pricing.with_columns(pl.lit(0.10).alias("fwd_return_raw"))
    cost_applied = model.apply_costs(df)
    
    # AAPL ADTV = 50M * $150 = $7.5B. > $2B small cap threshold, should get large cap 20bps
    large_cap_cost = cost_applied["fixed_cost_bps"][0]
    assert large_cap_cost == 0.0020
    assert cost_applied["total_exec_cost"][0] > 0.0040 # 2x fixed + impact
    assert cost_applied["net_fwd_return"][0] < 0.10


def test_benjamini_hochberg_correction():
    """Verify multiple hypothesis correction math."""
    p_values = [0.01, 0.04, 0.03, 0.15, 0.20]
    # Sorted: 0.01 (rank 1), 0.03 (rank 2), 0.04 (rank 3)...
    # CV at alpha=0.05: 0.01, 0.02, 0.03, 0.04, 0.05
    # 0.01 <= 0.01 (True)
    # 0.03 > 0.02 (False)
    sig = benjamini_hochberg_fdr(p_values, alpha=0.05)
    assert sig[0] is True   # The 0.01
    assert sum(sig) == 1    # Only 1 hypothesis survives FDR


def test_engine_end_to_end_memory_profile(mock_signals: pl.DataFrame, mock_pricing: pl.DataFrame):
    """Smoke test complete pipeline and memory boundary."""
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss
    
    engine = AlphaFactoryEngine()
    result = engine.run_backtest(mock_signals, mock_pricing, top_n_decile=None)
    
    mem_after = process.memory_info().rss
    memory_used_mb = (mem_after - mem_before) / (1024 * 1024)
    
    # Assertions
    assert memory_used_mb < 12288, f"Used {memory_used_mb} MB"
    assert "overall_sharpe" in result
    assert "metrics_by_regime" in result
    assert result["ledger"].height == mock_signals.height
    assert result["survivorship_flags"] == 0
