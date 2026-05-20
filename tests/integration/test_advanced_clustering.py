import numpy as np
import polars as pl
from src.models.advanced_clustering import AdvancedManagerClustering
from src.utils.quant_stats import cohens_d, compute_bootstrap_ci, rigorous_cluster_validation


def test_cohens_d():
    # Large effect size
    g1 = np.random.normal(5, 1, 100)
    g2 = np.random.normal(0, 1, 100)
    d = cohens_d(g1, g2)
    assert d > 3.0 # Strong positive effect

def test_bootstrap_ci():
    data = np.random.normal(0, 1, 1000)
    low, high = compute_bootstrap_ci(data)
    # 0 should be tightly bounded within CI
    assert low < 0.1 and high > -0.1

def test_rigorous_validation():
    # Mock data where cluster 1 is pure alpha, -1 is noise
    df = pl.DataFrame({
        "cluster_id": [-1]*50 + [1]*50,
        "forward_return_1q": np.concatenate([np.random.normal(0, 0.01, 50), np.random.normal(0.05, 0.01, 50)])
    })
    
    val_df = rigorous_cluster_validation(df)
    res = val_df.filter(pl.col("cluster_id") == 1).to_dicts()[0]
    
    assert res["significant"] is True
    assert res["effect_size_d"] > 2.0 # Huge effect
    assert res["mann_whitney_pval"] < 0.01

def test_clustering_sweep_memory_constraint():
    import os

    import psutil
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss
    
    df = pl.DataFrame({
        "avg_hhi": np.random.rand(1000),
        "log_avg_aum": np.random.rand(1000),
        "avg_put_ratio": np.random.rand(1000)
    })
    engine = AdvancedManagerClustering(["avg_hhi", "log_avg_aum", "avg_put_ratio"])
    engine.sweep_hdbscan(df, [10, 20])
    
    mem_after = process.memory_info().rss
    memory_used_mb = (mem_after - mem_before) / (1024 * 1024)
    assert memory_used_mb < 12288 # Well under 12GB