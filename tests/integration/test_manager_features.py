import os

import duckdb
import numpy as np
import polars as pl
import psutil
import pytest
from src.features.manager_features import build_manager_features
from src.models.clustering import ManagerClusteringEngine, validate_clusters_anova


@pytest.fixture
def mock_db():
    """Sets up an in-memory DuckDB with mock EDGAR data."""
    conn = duckdb.connect(':memory:')
    conn.execute("""
        CREATE TABLE edgar_core_sample (
            FILINGMANAGER_NAME VARCHAR,
            REPORTCALENDARORQUARTER VARCHAR,
            CUSIP VARCHAR,
            VALUE DOUBLE,
            exposure_type VARCHAR
        );
        -- Manager A: Concentrated (Activist) - 4 quarters
        INSERT INTO edgar_core_sample VALUES 
        ('MGR_A', 'Q1', 'AAPL', 100, 'SH'), ('MGR_A', 'Q2', 'AAPL', 100, 'SH'),
        ('MGR_A', 'Q3', 'AAPL', 100, 'SH'), ('MGR_A', 'Q4', 'AAPL', 100, 'SH');
        
        -- Manager B: Diversified (Index) - 4 quarters
        INSERT INTO edgar_core_sample VALUES 
        ('MGR_B', 'Q1', 'AAPL', 50, 'SH'), ('MGR_B', 'Q1', 'MSFT', 50, 'SH'),
        ('MGR_B', 'Q2', 'AAPL', 50, 'SH'), ('MGR_B', 'Q2', 'MSFT', 50, 'SH'),
        ('MGR_B', 'Q3', 'AAPL', 50, 'SH'), ('MGR_B', 'Q3', 'MSFT', 50, 'SH'),
        ('MGR_B', 'Q4', 'AAPL', 50, 'SH'), ('MGR_B', 'Q4', 'MSFT', 50, 'SH');
        
        -- Manager C: Options Heavy - 4 quarters
        INSERT INTO edgar_core_sample VALUES 
        ('MGR_C', 'Q1', 'SPY', 100, 'Put'), ('MGR_C', 'Q2', 'SPY', 100, 'Put'),
        ('MGR_C', 'Q3', 'SPY', 100, 'Put'), ('MGR_C', 'Q4', 'SPY', 100, 'Put');
    """)
    return conn

def test_build_manager_features(mock_db):
    # When: calculating features
    df = build_manager_features(mock_db)
    
    # Then: Verify shapes and logic
    assert df.select(pl.len()).item() == 3
    
    # MGR_A should have HHI of 1.0 (100% in one stock)
    mgr_a = df.filter(pl.col("FILINGMANAGER_NAME") == "MGR_A")
    assert mgr_a.select("avg_hhi").item() == 1.0
    
    # MGR_B should have HHI of 0.5 (two stocks, 50% each -> 0.25 + 0.25)
    mgr_b = df.filter(pl.col("FILINGMANAGER_NAME") == "MGR_B")
    assert mgr_b.select("avg_hhi").item() == 0.5
    
    # MGR_C should have put ratio of 1.0
    mgr_c = df.filter(pl.col("FILINGMANAGER_NAME") == "MGR_C")
    assert mgr_c.select("avg_put_ratio").item() == 1.0

def test_clustering_engine():
    # Given: Dummy feature data (need > min_cluster_size to form clusters, so let's mock 100 rows)
    np.random.seed(42)
    # 50 High HHI, 50 Low HHI
    hhi = np.concatenate([np.random.normal(0.9, 0.05, 50), np.random.normal(0.1, 0.05, 50)])
    put = np.random.uniform(0, 0.1, 100)
    aum = np.random.normal(15, 1, 100)
    
    df = pl.DataFrame({"avg_hhi": hhi, "avg_put_ratio": put, "log_avg_aum": aum})
    
    engine = ManagerClusteringEngine(min_cluster_size=10, min_samples=5)
    result = engine.fit_predict(df)
    
    assert "cluster_id" in result.columns
    assert "cluster_prob" in result.columns
    
    # Should identify at least 2 clusters + noise (-1)
    unique_clusters = result.select("cluster_id").unique().to_series().to_list()
    assert len(unique_clusters) >= 2 

def test_anova_validation():
    # Given: Clustered data with distinct returns
    df = pl.DataFrame({
        "cluster_id": [0]*10 + [1]*10,
        "forward_return_1q":[0.05]*10 + [-0.02]*10 # Cluster 0 clearly outperforms 1
    })
    
    # When
    stats_res = validate_clusters_anova(df)
    
    # Then
    assert stats_res["valid"] is True
    assert stats_res["p_value"] < 0.05
    
def test_memory_constraint_manager_features(mock_db):
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss
    
    build_manager_features(mock_db)
    
    mem_after = process.memory_info().rss
    memory_used_mb = (mem_after - mem_before) / (1024 * 1024)
    
    assert memory_used_mb < 12288