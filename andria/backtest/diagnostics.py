"""Statistical validation and multiple hypothesis testing for backtests.

Peak memory approx: < 50 MB.
"""

from __future__ import annotations
import numpy as np
import polars as pl
import scipy.stats as stats
from andria.core.config import get_settings
from andria.core.exceptions import BacktestError


def calculate_sharpe(returns: pl.Series, risk_free_rate: float = 0.0, periods: int = 4) -> float:
    """Calculate annualized Sharpe ratio. Default periods=4 for quarterly."""
    if len(returns) < 2 or returns.std() == 0:
        return 0.0
    excess = returns - (risk_free_rate / periods)
    return float(np.sqrt(periods) * excess.mean() / excess.std())


def calculate_max_drawdown(returns: pl.Series) -> float:
    """Calculate maximum peak-to-trough drawdown."""
    if len(returns) == 0:
        return 0.0
    cum_returns = (1 + returns).cum_prod()
    running_max = cum_returns.cum_max()
    drawdowns = (cum_returns - running_max) / running_max
    return float(drawdowns.min())


def benjamini_hochberg_fdr(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """Applies Benjamini-Hochberg False Discovery Rate (FDR) correction.
    
    Prevents p-value hacking across multiple regimes/signals.
    
    Args:
        p_values: List of raw p-values.
        alpha: Target FDR alpha level.
        
    Returns:
        List of booleans indicating significance after correction.
    """
    if not p_values:
        return[]
    
    n = len(p_values)
    sorted_indices = np.argsort(p_values)
    ranks = np.empty_like(sorted_indices)
    ranks[sorted_indices] = np.arange(1, n + 1)
    
    # BH critical values: (i / m) * alpha
    critical_values = (ranks / n) * alpha
    
    # A p-value is significant if it is <= critical value
    return [bool(p <= cv) for p, cv in zip(p_values, critical_values)]


def regime_conditional_metrics(df: pl.DataFrame) -> dict[str, dict[str, float]]:
    """Calculates backtest performance metrics stratified by Macro Regime."""
    if "regime_label" not in df.columns or "net_fwd_return" not in df.columns:
        raise BacktestError("DataFrame must contain 'regime_label' and 'net_fwd_return'.")

    results = {}
    regimes = df["regime_label"].unique().to_list()
    p_values =[]
    
    for regime in regimes:
        regime_data = df.filter(pl.col("regime_label") == regime)["net_fwd_return"]
        
        # 1-sample t-test testing if mean return > 0
        if len(regime_data) > 1:
            t_stat, p_val = stats.ttest_1samp(regime_data.to_numpy(), popmean=0.0, alternative='greater')
        else:
            t_stat, p_val = 0.0, 1.0
            
        p_values.append(p_val)
        results[regime] = {
            "n_obs": len(regime_data),
            "mean_return": float(regime_data.mean() or 0.0),
            "sharpe": calculate_sharpe(regime_data),
            "max_dd": calculate_max_drawdown(regime_data),
            "raw_p_value": float(p_val),
        }
    
    # Apply FDR correction across all tested regimes
    alpha = get_settings().backtest.significance.fdr_alpha
    is_significant = benjamini_hochberg_fdr(p_values, alpha=alpha)
    
    for regime, sig in zip(regimes, is_significant):
        results[regime]["fdr_significant"] = sig
        
    return results