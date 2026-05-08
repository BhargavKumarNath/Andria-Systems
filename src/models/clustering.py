"""
Manager Clustering & Archetype Identification Module
Uses HDBSCAN to discover behavioral archetype without forcing k clusters
"""
import polars as pl
import numpy as np
from sklearn.cluster import HDBSCAN
from sklearn.preprocessing import RobustScaler
from scipy import stats
import structlog

logger = structlog.get_logger()

class ManagerClusteringEngine:
    """Engine to cluster managers beased on 13F behavioral features"""
    
    def __init__(self, min_cluster_size: int = 50, min_samples: int = 10):
        self.scaler = RobustScaler()
        self.model = HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric='euclidean'
        )
        self.feature_cols = ['avg_hhi', 'avg_put_ratio', 'log_avg_aum']
    
    def fit_predict(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Scales features and applies HDBSCAN.

        Args:
            df: Polars DataFrame from build_manager_fearures.
        
        Returns:
            DataFrame with appended 'cluster_id' and 'cluster_prob' columns.
        """
        logger.info("fitting_hdbscan", rows=df.select(pl.len()).item())

        X = df.select(self.feature_cols).to_numpy()

        # Scale
        X_scaled = self.scaler.fit_transform(X)

        # Fit HDBSCAN
        labels = self.model.fit_predict(X_scaled)
        probs = self.model.probabilities_

        return df.with_columns([
            pl.Series("cluster_id", labels, dtype=pl.Int32),
            pl.Series("cluster_prob", probs, dtype=pl.Float32)
        ])
    
def validate_clusters_anova(df: pl.DataFrame, target_col: str = "forward_return_1q") -> dict:
    """
    Calculates 1-way ANOVA to check if clusters have statistically significant
    different forward returns. Differentiates signal from noise.
    """
    # Filter out noise cluster (-1)
    clean_df = df.filter((pl.col("cluster_id") != -1) & pl.col(target_col).is_not_null())
    
    # Extract arrays per cluster
    groups = []
    cluster_ids = clean_df.select("cluster_id").unique().to_series().to_list()
    
    for cid in cluster_ids:
        returns = clean_df.filter(pl.col("cluster_id") == cid).select(target_col).to_series().to_list()
        if len(returns) > 5:
            groups.append(returns)
            
    if len(groups) < 2:
        return {"f_stat": 0.0, "p_value": 1.0, "valid": False}
        
    f_stat, p_val = stats.f_oneway(*groups)
    
    return {
        "f_stat": float(f_stat),
        "p_value": float(p_val),
        "valid": bool(p_val < 0.05)
    }
        



    

