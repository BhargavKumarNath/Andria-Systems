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
    return [bool(p <= cv) for p, cv in zip(p_values, critical_values, strict=False)]


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
            _t_stat, p_val = 0.0, 1.0
            
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
    
    for regime, sig in zip(regimes, is_significant, strict=False):
        results[regime]["fdr_significant"] = sig
        
    return results


def regime_transition_metrics(df: pl.DataFrame, transition_window_days: int = 10) -> dict[str, object]:
    """Analyse performance during regime transitions vs. stable regime periods.

    Many strategies fail during regime transitions due to factor rotation and
    liquidity stress. This function flags trades initiated within
    ``transition_window_days`` of a detected regime change.

    Args:
        df:                      Trade ledger with ``exec_date``, ``regime_label``,
                                 ``net_fwd_return``.
        transition_window_days:  Number of calendar days before/after a regime
                                 change that define the "transition zone".

    Returns:
        Dict with keys ``"in_regime"``, ``"at_transition"``, containing
        Sharpe, mean return, and n_obs for each bucket.
    """
    required = {"exec_date", "regime_label", "net_fwd_return"}
    if not required.issubset(set(df.columns)):
        return {"error": f"Missing columns: {required - set(df.columns)}"}

    # Detect regime change dates: where regime_label differs from previous row
    sorted_df = df.sort("exec_date")
    regime_labels = sorted_df["regime_label"].to_list()
    exec_dates = sorted_df["exec_date"].to_list()

    transition_dates: list = []
    for i in range(1, len(regime_labels)):
        if regime_labels[i] != regime_labels[i - 1]:
            transition_dates.append(exec_dates[i])

    if not transition_dates:
        return {
            "in_regime": {"n_obs": df.height, "sharpe": calculate_sharpe(df["net_fwd_return"]),
                          "mean_return": float(df["net_fwd_return"].mean() or 0.0)},
            "at_transition": {"n_obs": 0, "sharpe": 0.0, "mean_return": 0.0},
            "n_detected_transitions": 0,
        }

    # Tag each trade as "at_transition" if within transition_window_days of any transition

    def is_near_transition(exec_dt: object) -> bool:
        for t_date in transition_dates:
            try:
                if abs((exec_dt - t_date).days) <= transition_window_days:
                    return True
            except Exception:
                pass
        return False

    transition_flags = [is_near_transition(d) for d in exec_dates]
    sorted_df = sorted_df.with_columns(
        pl.Series("at_transition", transition_flags, dtype=pl.Boolean)
    )

    in_regime = sorted_df.filter(~pl.col("at_transition"))
    at_transition = sorted_df.filter(pl.col("at_transition"))

    def _metrics(sub: pl.DataFrame) -> dict[str, object]:
        if sub.height == 0:
            return {"n_obs": 0, "sharpe": 0.0, "mean_return": 0.0}
        return {
            "n_obs": sub.height,
            "sharpe": round(calculate_sharpe(sub["net_fwd_return"]), 4),
            "mean_return": round(float(sub["net_fwd_return"].mean() or 0.0), 6),
            "max_drawdown": round(calculate_max_drawdown(sub["net_fwd_return"]), 4),
        }

    return {
        "in_regime": _metrics(in_regime),
        "at_transition": _metrics(at_transition),
        "n_detected_transitions": len(transition_dates),
        "transition_window_days": transition_window_days,
    }