"""Drift and Stability Monitoring (Phase 4.13).

Tracks three types of signal degradation over time:

1. **PSI (Population Stability Index)** — measures distribution shift of RACS
   scores across quarters. PSI > 0.25 is a serious stability concern.
   PSI > 0.10 warrants investigation.

2. **Feature drift** — KS-test on clustering input feature distributions
   across time windows. Sustained drift indicates the 13F behavioral landscape
   is changing in ways the model was not trained on.

3. **Signal decay tracking** — rolling IC (Information Coefficient) over
   trailing 4 quarters. IC < 0.02 for 2+ consecutive quarters triggers
   a "signal decay alert".

Usage::

    from andria.research.drift_monitor import DriftMonitor
    monitor = DriftMonitor()
    psi_report = monitor.compute_psi(signals, score_col="regime_adjusted_racs")
    monitor.print_psi_report(psi_report)
"""

from __future__ import annotations

import numpy as np
import polars as pl
from rich.console import Console
from scipy.stats import ks_2samp, spearmanr

from andria.core.logging import get_logger

logger = get_logger(__name__)
_console = Console()

# PSI thresholds (industry standard)
PSI_GREEN = 0.10   # stable
PSI_YELLOW = 0.25  # minor shift — investigate
# PSI > 0.25 → major shift — model needs retraining

IC_DECAY_THRESHOLD = 0.02    # IC below this for 2+ quarters → decay alert
IC_DECAY_CONSECUTIVE = 2     # consecutive quarters below threshold


class DriftMonitor:
    """Monitors signal and feature stability over time.

    All methods are stateless — they accept DataFrames and return results.
    No internal state is mutated between calls.
    """

    # PSI
    @staticmethod
    def compute_psi(
        signals: pl.DataFrame,
        score_col: str = "regime_adjusted_racs",
        time_col: str = "quarter",
        n_bins: int = 10,
        reference_period: str | None = None,
    ) -> dict[str, object]:
        """Compute Population Stability Index for the signal score distribution.

        Compares the distribution of ``score_col`` in each quarter against a
        reference period (default: first quarter in the dataset).

        Args:
            signals:          Signal DataFrame with ``score_col`` and ``time_col``.
            score_col:        Score column to monitor (default: regime_adjusted_racs).
            time_col:         Time grouping column (default: quarter).
            n_bins:           Number of histogram bins.
            reference_period: Reference quarter label. Defaults to earliest.

        Returns:
            Dict with PSI per quarter and an overall stability assessment.
        """
        if score_col not in signals.columns or time_col not in signals.columns:
            return {"error": f"Missing columns: {score_col} or {time_col}"}

        periods = sorted(signals[time_col].unique().to_list())
        if not periods:
            return {"psi_by_period": {}, "overall_status": "no_data"}

        ref_period = reference_period or periods[0]
        ref_scores = signals.filter(pl.col(time_col) == ref_period)[score_col].drop_nulls().to_numpy()

        if len(ref_scores) < 10:
            return {"error": f"Insufficient reference data in {ref_period}"}

        # Build reference bin edges
        edges = np.percentile(ref_scores, np.linspace(0, 100, n_bins + 1))
        edges[0] = -np.inf
        edges[-1] = np.inf

        def _ref_dist(arr: np.ndarray) -> np.ndarray:
            counts, _ = np.histogram(arr, bins=edges)
            pct = counts / max(counts.sum(), 1)
            return np.where(pct == 0, 1e-6, pct)

        ref_dist = _ref_dist(ref_scores)
        psi_by_period: dict[str, float] = {}

        for period in periods:
            if period == ref_period:
                psi_by_period[period] = 0.0
                continue
            curr_scores = signals.filter(pl.col(time_col) == period)[score_col].drop_nulls().to_numpy()
            if len(curr_scores) < 5:
                continue
            curr_dist = _ref_dist(curr_scores)
            psi = float(np.sum((curr_dist - ref_dist) * np.log(curr_dist / ref_dist)))
            psi_by_period[period] = round(psi, 5)

        max_psi = max(psi_by_period.values()) if psi_by_period else 0.0
        status = "stable" if max_psi < PSI_GREEN else ("warning" if max_psi < PSI_YELLOW else "degraded")

        if status != "stable":
            logger.warning(
                "psi_drift_detected",
                max_psi=round(max_psi, 4),
                status=status,
                score_col=score_col,
            )

        return {
            "reference_period": ref_period,
            "psi_by_period": psi_by_period,
            "max_psi": round(max_psi, 5),
            "overall_status": status,
            "thresholds": {"green": PSI_GREEN, "yellow": PSI_YELLOW},
        }

    # Feature drift
    @staticmethod
    def compute_feature_drift(
        features_df: pl.DataFrame,
        feature_cols: list[str],
        time_col: str = "quarter",
        reference_period: str | None = None,
    ) -> dict[str, object]:
        """KS-test for feature distribution drift between periods.

        Args:
            features_df:      Manager DNA feature DataFrame.
            feature_cols:     List of numeric feature column names to monitor.
            time_col:         Time grouping column.
            reference_period: Reference quarter. Defaults to earliest.

        Returns:
            Dict with KS statistic and p-value per feature per period.
        """
        periods = sorted(features_df[time_col].unique().to_list())
        if not periods:
            return {"error": "No periods found"}

        ref_period = reference_period or periods[0]
        ref_data = features_df.filter(pl.col(time_col) == ref_period)

        drift_results: dict[str, dict[str, object]] = {}

        for feat in feature_cols:
            if feat not in features_df.columns:
                continue
            ref_vals = ref_data[feat].drop_nulls().to_numpy()
            if len(ref_vals) < 10:
                continue

            feat_drifts: dict[str, object] = {}
            for period in periods:
                if period == ref_period:
                    continue
                curr_vals = features_df.filter(pl.col(time_col) == period)[feat].drop_nulls().to_numpy()
                if len(curr_vals) < 10:
                    continue
                ks_stat, p_val = ks_2samp(ref_vals, curr_vals)
                feat_drifts[period] = {
                    "ks_statistic": round(float(ks_stat), 5),
                    "p_value": round(float(p_val), 5),
                    "significant": bool(p_val < 0.05),
                }

            drift_results[feat] = feat_drifts

        return {"reference_period": ref_period, "feature_drift": drift_results}

    # Rolling IC
    @staticmethod
    def compute_rolling_ic(
        signals: pl.DataFrame,
        score_col: str = "regime_adjusted_racs",
        return_col: str = "net_fwd_return",
        time_col: str = "quarter",
    ) -> dict[str, object]:
        """Compute rolling IC per quarter and detect sustained decay.

        Args:
            signals:    DataFrame with score, return, and time columns.
            score_col:  Signal score column.
            return_col: Forward return column.
            time_col:   Time grouping column.

        Returns:
            Dict with IC per quarter and decay alert status.
        """
        required = {score_col, return_col, time_col}
        if not required.issubset(set(signals.columns)):
            return {"error": f"Missing: {required - set(signals.columns)}"}

        periods = sorted(signals[time_col].unique().to_list())
        ic_by_period: dict[str, float] = {}

        for period in periods:
            sub = signals.filter(pl.col(time_col) == period).drop_nulls(
                subset=[score_col, return_col]
            )
            if sub.height < 10:
                continue
            ic, _ = spearmanr(sub[score_col].to_numpy(), sub[return_col].to_numpy())
            ic_by_period[period] = round(float(ic), 5)

        # Check for sustained decay
        ic_series = list(ic_by_period.values())
        decay_alert = False
        if len(ic_series) >= IC_DECAY_CONSECUTIVE:
            recent = ic_series[-IC_DECAY_CONSECUTIVE:]
            if all(abs(ic) < IC_DECAY_THRESHOLD for ic in recent):
                decay_alert = True
                logger.warning(
                    "signal_decay_alert",
                    consecutive_quarters=IC_DECAY_CONSECUTIVE,
                    recent_ics=recent,
                    threshold=IC_DECAY_THRESHOLD,
                )

        return {
            "ic_by_period": ic_by_period,
            "decay_alert": decay_alert,
            "ic_threshold": IC_DECAY_THRESHOLD,
            "mean_ic": round(float(np.mean(ic_series)), 5) if ic_series else 0.0,
        }

    @staticmethod
    def print_psi_report(report: dict[str, object]) -> None:
        """Display PSI results with colour-coded status."""
        status = str(report.get("overall_status", "unknown"))
        colour = {"stable": "green", "warning": "yellow", "degraded": "red"}.get(status, "white")
        _console.print(
            f"\n[{colour}]PSI Report — Status: {status.upper()}[/{colour}]"
            f"  (reference: {report.get('reference_period')})"
        )
        _console.print(
            f"  Max PSI: {report.get('max_psi', 'n/a')} "
            f"(green <{PSI_GREEN}, yellow <{PSI_YELLOW})"
        )
        by_period = report.get("psi_by_period", {})
        for period, psi in sorted(by_period.items()):  # type: ignore[union-attr]
            bar = "■" * min(int(float(psi) * 40), 40)
            _console.print(f"  {period}: {float(psi):.4f} {bar}")
