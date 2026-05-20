"""Probability of Backtest Overfitting (PBO) and Deflated Sharpe Ratio (Phase 4.9).

Implements two institutionally rigorous metrics for assessing whether a
backtest Sharpe ratio is statistically defensible:

1. **Probability of Backtest Overfitting (PBO)** — Bailey, Borwein, Lopez de
   Prado & Zhu (2016). Uses combinatorially symmetric cross-validation (CSCV)
   to measure the probability that a strategy selected for best in-sample
   performance will underperform out-of-sample. PBO > 0.5 is a strong
   indication of overfitting.

2. **Deflated Sharpe Ratio (DSR)** — Bailey & Lopez de Prado (2014). Adjusts
   the observed Sharpe ratio for: number of trials, non-normality of returns
   (skewness and excess kurtosis), and serial correlation. A deflated Sharpe
   below 1.0 is not statistically significant at conventional levels.

Usage::

    from andria.backtest.overfitting import ProbabilityOfBacktestOverfitting, DeflatedSharpeRatio
    pbo = ProbabilityOfBacktestOverfitting(n_partitions=16)
    pbo_score = pbo.compute(ledger)

    dsr = DeflatedSharpeRatio(n_trials=21)
    dsr_score = dsr.compute(ledger)
"""

from __future__ import annotations

import math
from itertools import combinations

import numpy as np
import polars as pl
import scipy.stats as stats

from andria.backtest.diagnostics import calculate_sharpe
from andria.core.logging import get_logger

logger = get_logger(__name__)


class ProbabilityOfBacktestOverfitting:
    """Combinatorially Symmetric Cross-Validation (CSCV) implementation.

    Splits the trade ledger into N equal-sized sub-periods. For each way
    of choosing half the periods as "training", computes whether the strategy
    that ranks best in-sample also ranks above median out-of-sample.

    PBO = fraction of combinations where OOS performance rank < median.
    PBO > 0.5 → backtest is likely overfit.

    Args:
        n_partitions: Number of sub-periods. Must be even. Typically 16.
    """

    def __init__(self, n_partitions: int = 16) -> None:
        if n_partitions % 2 != 0:
            raise ValueError("n_partitions must be even.")
        self.n_partitions = n_partitions

    def compute(self, ledger: pl.DataFrame) -> float:
        """Compute the PBO score.

        Args:
            ledger: Trade ledger with ``net_fwd_return`` and ``exec_date``.

        Returns:
            PBO score in [0, 1]. Values > 0.5 indicate overfitting.
        """
        if "net_fwd_return" not in ledger.columns:
            raise ValueError("Ledger must contain 'net_fwd_return'.")

        # Sort by date for temporal integrity
        if "exec_date" in ledger.columns:
            ledger = ledger.sort("exec_date")

        returns = ledger["net_fwd_return"].to_numpy()
        n = len(returns)
        k = self.n_partitions
        size = n // k

        if size < 5:
            logger.warning("pbo_insufficient_data", n=n, partitions=k)
            return float("nan")

        # Bailey's CSCV requires a matrix of configurations (T x M)
        # We simulate M=21 alternative configurations to rank against
        M = 21
        rng = np.random.default_rng(42)  # fixed seed for deterministic reproducibility
        
        # Build T x M matrix of returns
        config_returns = np.zeros((n, M))
        config_returns[:, 0] = returns  # configuration 0 is the actual strategy
        for i in range(1, M):
            config_returns[:, i] = rng.permutation(returns)

        # Partition returns into k sub-matrices (size x M)
        partitions = [config_returns[i * size: (i + 1) * size, :] for i in range(k)]

        half = k // 2
        is_combinations = list(combinations(range(k), half))
        all_indices = set(range(k))

        oos_sharpes_below_median: int = 0
        total_combinations: int = 0

        for is_idx in is_combinations:
            oos_idx = list(all_indices - set(is_idx))

            is_matrix = np.concatenate([partitions[i] for i in is_idx], axis=0)
            oos_matrix = np.concatenate([partitions[i] for i in oos_idx], axis=0)

            # Calculate IS Sharpe for all M configurations
            is_mean = np.mean(is_matrix, axis=0)
            is_std = np.std(is_matrix, axis=0)
            is_std[is_std == 0] = 1e-9
            is_sharpe = is_mean / is_std
            
            # Identify optimal IS configuration
            n_star = int(np.argmax(is_sharpe))

            # Calculate OOS Sharpe for all M configurations
            oos_mean = np.mean(oos_matrix, axis=0)
            oos_std = np.std(oos_matrix, axis=0)
            oos_std[oos_std == 0] = 1e-9
            oos_sharpe = oos_mean / oos_std

            # Find relative rank of n_star in OOS
            n_star_oos_sharpe = oos_sharpe[n_star]
            
            # Rank: how many configurations have OOS Sharpe <= n_star OOS Sharpe
            # If rank / M < 0.5, it is below median
            rank = np.sum(oos_sharpe <= n_star_oos_sharpe)
            omega_c = rank / M
            
            if omega_c < 0.5:
                oos_sharpes_below_median += 1
            
            total_combinations += 1

        pbo = oos_sharpes_below_median / total_combinations if total_combinations > 0 else float("nan")
        logger.info(
            "pbo_computed",
            pbo=round(pbo, 4),
            combinations_tested=total_combinations,
            interpretation="OVERFIT" if pbo > 0.5 else "OK",
        )
        return pbo


class DeflatedSharpeRatio:
    """Adjusts the observed Sharpe ratio for multiple testing and non-normality.

    The DSR accounts for:
    - Number of strategy trials/configurations tested (type I error inflation)
    - Return skewness and excess kurtosis (non-normality of return distribution)
    - Serial autocorrelation in returns (overstated N)

    A DSR < 1.0 means the Sharpe ratio is not statistically significant
    at the conventional 5% level after these corrections.

    Args:
        n_trials:   Number of configurations/trials tested. Use the total
                    number of subphases/parameters optimized (~21 for Phase 4).
        periods:    Annualization factor (4 for quarterly, 252 for daily).
    """

    def __init__(self, n_trials: int = 21, periods: int = 4) -> None:
        self.n_trials = n_trials
        self.periods = periods

    def compute(self, ledger: pl.DataFrame) -> dict[str, float]:
        """Compute the Deflated Sharpe Ratio and supporting statistics.

        Args:
            ledger: Trade ledger with ``net_fwd_return``.

        Returns:
            Dict with keys: ``sharpe_observed``, ``sharpe_benchmark``,
            ``dsr``, ``is_significant``, ``skewness``, ``excess_kurtosis``,
            ``serial_corr``.
        """
        if "net_fwd_return" not in ledger.columns:
            raise ValueError("Ledger must contain 'net_fwd_return'.")

        r = ledger["net_fwd_return"].drop_nulls().to_numpy()
        n = len(r)

        if n < 10:
            logger.warning("dsr_insufficient_data", n=n)
            return {"sharpe_observed": float("nan"), "dsr": float("nan"), "is_significant": False}

        # Observed annualized Sharpe
        sr_obs = float(calculate_sharpe(pl.Series(r), periods=self.periods))

        # Non-normality corrections
        skew = float(stats.skew(r))
        kurt = float(stats.kurtosis(r))  # excess kurtosis

        # Serial correlation (lag-1 autocorrelation)
        serial_corr = float(np.corrcoef(r[:-1], r[1:])[0, 1]) if n > 1 else 0.0

        # Effective N adjusted for serial correlation
        n_eff = n * (1 - serial_corr) / (1 + serial_corr) if abs(serial_corr) < 1 else n

        # Expected maximum Sharpe under the null (Bailey & Lopez de Prado 2014)
        # Approximation: E[max SR] ≈ (1 - γ) * Z^{-1}(1 - 1/n_trials) + γ * Z^{-1}(1 - 1/(n_trials * e))
        # Simplified version used here:
        z_star = stats.norm.ppf(1.0 - 1.0 / self.n_trials)
        sr_benchmark = (
            z_star
            * math.sqrt(1 / n_eff)
            * math.sqrt(1 - skew * sr_obs + (kurt / 4.0) * sr_obs ** 2)
        ) * math.sqrt(self.periods)

        # Deflated Sharpe Ratio = observed / benchmark
        dsr = sr_obs / sr_benchmark if sr_benchmark > 0 else float("nan")
        is_significant = bool(dsr > 1.0) if not math.isnan(dsr) else False

        result = {
            "sharpe_observed": round(sr_obs, 4),
            "sharpe_benchmark": round(sr_benchmark, 4),
            "dsr": round(dsr, 4) if not math.isnan(dsr) else float("nan"),
            "is_significant": is_significant,
            "skewness": round(skew, 4),
            "excess_kurtosis": round(kurt, 4),
            "serial_corr_lag1": round(serial_corr, 4),
            "n_effective": round(n_eff, 1),
            "n_trials_adjusted_for": self.n_trials,
        }

        logger.info(
            "dsr_computed",
            sharpe=round(sr_obs, 3),
            dsr=round(dsr, 3) if not math.isnan(dsr) else "nan",
            significant=is_significant,
            n_trials=self.n_trials,
        )
        return result
