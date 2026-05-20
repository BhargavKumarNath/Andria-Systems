"""MLflow experiment tracking wrapper (Phase 4.14).

Provides a thin, ergonomic wrapper around MLflow that auto-logs all backtest
runs with parameters, metrics, artifact paths, git commit hash, and seed.

The tracking store is file-based (``artifacts/mlflow/``) — no server or
cloud account required. View experiments with::

    mlflow ui --backend-store-uri artifacts/mlflow

Usage::

    from andria.research.experiment_tracker import ExperimentTracker
    tracker = ExperimentTracker()
    with tracker.run(run_name="phase4_batch1") as run:
        tracker.log_params(cfg)
        tracker.log_backtest_results(results, ledger)
        tracker.log_coverage_report(coverage_report)

Or as a decorator::

    @tracker.track_experiment(name="signal_decay_analysis")
    def run_decay_analysis():
        ...
"""

from __future__ import annotations

import functools
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from andria.core.config import Settings, get_settings
from andria.core.logging import get_logger
from andria.research.governance import _get_git_commit

logger = get_logger(__name__)


class ExperimentTracker:
    """MLflow experiment tracker with Andria-specific helpers.

    Args:
        cfg: Settings instance. Defaults to ``get_settings()``.
    """

    def __init__(self, cfg: Settings | None = None) -> None:
        self._cfg = cfg or get_settings()
        self._mlflow_available = self._setup_mlflow()
        self._active_run: Any = None

    def _setup_mlflow(self) -> bool:
        """Initialise MLflow with the configured tracking URI."""
        try:
            import mlflow
            tracking_uri = self._cfg.experiment.mlflow_tracking_uri

            # Resolve relative paths against project root
            uri_path = Path(tracking_uri)
            if not uri_path.is_absolute():
                uri_path = self._cfg.project_root / uri_path
            uri_path.mkdir(parents=True, exist_ok=True)

            mlflow.set_tracking_uri(uri_path.as_uri())
            mlflow.set_experiment(self._cfg.experiment.mlflow_experiment_name)
            logger.info("mlflow_initialised", tracking_uri=str(uri_path))
            return True
        except ImportError:
            logger.warning("mlflow_not_available", note="Install mlflow to enable experiment tracking")
            return False
        except Exception as exc:
            logger.warning("mlflow_setup_failed", error=str(exc))
            return False

    @contextmanager
    def run(self, run_name: str | None = None) -> Generator[Any, None, None]:
        """Context manager that wraps a MLflow run.

        Automatically tags the run with git commit and seed. Ends the run
        on exit (even on exception).

        Args:
            run_name: Human-readable name for this run.

        Yields:
            The active mlflow Run object, or None if MLflow is unavailable.
        """
        if not self._mlflow_available:
            yield None
            return

        import mlflow
        run_name = run_name or f"andria_{self._cfg.run_id}"
        with mlflow.start_run(run_name=run_name) as active_run:
            self._active_run = active_run
            mlflow.set_tags({
                "git_commit": _get_git_commit(),
                "seed": str(self._cfg.experiment.seed),
                "run_id": self._cfg.run_id,
                "andria_phase": "4",
            })
            logger.info("mlflow_run_started", run_name=run_name, run_uuid=active_run.info.run_id)
            try:
                yield active_run
            finally:
                self._active_run = None
                logger.info("mlflow_run_ended", run_name=run_name)

    def log_params(self, cfg: Settings | None = None) -> None:
        """Log all flat scalar parameters from Settings."""
        if not self._mlflow_available:
            return
        import mlflow
        cfg = cfg or self._cfg
        params = {
            "filing_lag_days": cfg.backtest.filing_lag_days,
            "holding_period_days": cfg.backtest.holding_period_days,
            "top_n_decile": cfg.backtest.top_n_decile,
            "large_cap_bps": cfg.backtest.costs.large_cap_bps,
            "small_cap_bps": cfg.backtest.costs.small_cap_bps,
            "fill_delay_days": cfg.execution.fill_delay_days,
            "adv_participation_limit": cfg.execution.adv_participation_limit,
            "execution_mode": cfg.execution.execution_mode,
            "fdr_alpha": cfg.backtest.significance.fdr_alpha,
            "seed": cfg.experiment.seed,
            "hmm_n_components": cfg.hmm.n_components,
            "racs_regime_weight": cfg.signals.racs.regime_weight,
        }
        mlflow.log_params(params)

    def log_backtest_results(
        self,
        results: dict[str, Any],
        ledger: Any | None = None,
    ) -> None:
        """Log backtest summary metrics to the active MLflow run.

        Args:
            results: Output dict from ``AlphaFactoryEngine.run_backtest()``.
            ledger:  Optional trade ledger Polars DataFrame for additional metrics.
        """
        if not self._mlflow_available:
            return
        import mlflow

        mlflow.log_metrics({
            "overall_sharpe": float(results.get("overall_sharpe", 0.0)),
            "survivorship_flags": int(results.get("survivorship_flags", 0)),
        })

        # Per-regime metrics
        for regime, metrics in (results.get("metrics_by_regime") or {}).items():
            prefix = f"regime_{regime.lower().replace(' ', '_')}"
            mlflow.log_metrics({
                f"{prefix}_sharpe": float(metrics.get("sharpe", 0.0)),
                f"{prefix}_mean_return": float(metrics.get("mean_return", 0.0)),
                f"{prefix}_n_obs": int(metrics.get("n_obs", 0)),
            })

        # Leakage audit results
        audit = results.get("leakage_audit")
        if audit:
            audit_dict = audit.to_dict() if hasattr(audit, "to_dict") else audit
            mlflow.log_metrics({
                "leakage_errors": int(audit_dict.get("error_count", 0)),
                "leakage_warnings": int(audit_dict.get("warning_count", 0)),
            })

    def log_coverage_report(self, report: Any) -> None:
        """Log data provenance coverage metrics."""
        if not self._mlflow_available:
            return
        import mlflow
        if hasattr(report, "coverage_pct"):
            mlflow.log_metrics({
                "data_coverage_pct": float(report.coverage_pct),
                "unmapped_cusips": int(report.unmapped_count),
                "failed_tickers": int(report.failed_count),
            })

    def log_rfn_diagnostics(self, rfn_status: dict[str, Any]) -> None:
        """Log Risk Factor Neutralization regression diagnostics."""
        if not self._mlflow_available:
            return
        import mlflow
        if rfn_status.get("status") == "complete":
            mlflow.log_metrics({
                "rfn_r_squared": float(rfn_status.get("r_squared", 0.0)),
                "rfn_alpha_bps": float(rfn_status.get("annualized_alpha_bps", 0.0)),
            })

    def track_experiment(self, name: str | None = None) -> Callable[..., Any]:
        """Decorator that wraps a function in a MLflow run.

        Usage::

            @tracker.track_experiment(name="walk_forward")
            def run_wf():
                ...
        """
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            @functools.wraps(fn)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                with self.run(run_name=name or fn.__name__):
                    return fn(*args, **kwargs)
            return wrapper
        return decorator
