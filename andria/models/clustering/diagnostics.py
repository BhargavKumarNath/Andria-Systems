"""Diagnostics and validation for Manager Clustering.

Computes internal validity metrics (Silhouette, Davies-Bouldin)
and external validity metrics (ANOVA, KS-tests) to verify cluster robustness.
"""

from __future__ import annotations
import numpy as np
from scipy import stats
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score
from andria.core.logging import get_logger

logger = get_logger(__name__)


def cohens_d(group1: np.ndarray, group2: np.ndarray) -> float:
    """Calculate Cohen's d for effect size between two arrays."""
    n1, n2 = len(group1), len(group2)
    if n1 < 2 or n2 < 2:
        return 0.0
    var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    if pooled_std == 0:
        return 0.0
    return float((np.mean(group1) - np.mean(group2)) / pooled_std)


def compute_bootstrap_ci(
    data: np.ndarray, n_bootstraps: int = 2000, ci: float = 0.95
) -> tuple[float, float]:
    """Computes bootstrapped confidence intervals for the mean."""
    if len(data) < 2:
        return 0.0, 0.0
    res = stats.bootstrap(
        (data,), np.mean, confidence_level=ci, n_resamples=n_bootstraps, method="BCa"
    )
    return float(res.confidence_interval.low), float(res.confidence_interval.high)


def internal_validation(X: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    """Calculate Silhouette, Davies-Bouldin, and Calinski-Harabasz scores."""
    mask = labels != -1
    n_clusters = len(set(labels[mask]))

    if n_clusters < 2 or len(X[mask]) < n_clusters:
        return {"silhouette": -1.0, "davies_bouldin": 999.0, "calinski_harabasz": 0.0}

    try:
        # Subsample for silhouette to save compute if dataset is huge
        sample_size = min(5000, len(X[mask]))
        sil = silhouette_score(X[mask], labels[mask], sample_size=sample_size, random_state=42)
        db = davies_bouldin_score(X[mask], labels[mask])
        ch = calinski_harabasz_score(X[mask], labels[mask])
        return {
            "silhouette": float(sil),
            "davies_bouldin": float(db),
            "calinski_harabasz": float(ch),
        }
    except Exception as e:
        logger.warning("internal_validation_failed", error=str(e))
        return {"silhouette": -1.0, "davies_bouldin": 999.0, "calinski_harabasz": 0.0}
