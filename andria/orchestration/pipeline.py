"""Pipeline orchestrator — manages run lifecycle and artifact manifests.

Each pipeline run produces:
  artifacts/runs/{run_id}/
    manifest.json         ← inputs, params, git sha, output hashes, timing
    features/
    clusters/
    signals/
    regime/
"""

from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from andria.core.config import Settings
from andria.core.exceptions import DataNotFoundError, PipelineError
from andria.core.logging import get_logger
from andria.ingestion.registry import DatasetRegistry
from rich.progress import Progress, TextColumn, BarColumn, TimeElapsedColumn

logger = get_logger(__name__)


def _git_sha() -> str:
    try:
        import subprocess

        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


class PipelineOrchestrator:
    """Coordinates all pipeline stages with logging, artifact management, and error handling."""

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg
        self._registry = DatasetRegistry(cfg)
        self._artifacts_root = cfg.paths.artifacts

    def _new_run_dir(self) -> tuple[str, Path]:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        run_id = f"{ts}_{uuid.uuid4().hex[:6]}"
        run_dir = self._artifacts_root / "runs" / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        for sub in ("features", "clusters", "signals", "regime"):
            (run_dir / sub).mkdir(exist_ok=True)
        return run_id, run_dir

    def _write_manifest(
        self,
        run_dir: Path,
        run_id: str,
        stage: str,
        params: dict[str, Any],
        started_at: datetime,
        status: str = "success",
        error: str | None = None,
    ) -> None:
        manifest = {
            "run_id": run_id,
            "stage": stage,
            "git_sha": _git_sha(),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "params": params,
            "input_hashes": self._registry.build_input_hashes(),
            "error": error,
        }
        (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str))
        logger.info("manifest_written", run_id=run_id, stage=stage, status=status)

    # Ingestion
    def run_ingestion(self) -> None:
        from andria.ingestion.edgar import EDGARIngester
        from andria.ingestion.fred import FREDIngester
        from andria.ingestion.ofr import OFRIngester

        logger.info("pipeline_ingestion_start")
        run_id, run_dir = self._new_run_dir()
        started = datetime.now(timezone.utc)
        try:
            EDGARIngester(self._cfg).run()
            FREDIngester(self._cfg).run()
            OFRIngester(self._cfg).run()
            self._write_manifest(run_dir, run_id, "ingestion", {}, started)
        except Exception as exc:
            self._write_manifest(
                run_dir, run_id, "ingestion", {}, started, status="failed", error=str(exc)
            )
            raise PipelineError("ingestion", exc) from exc

    # Phase 1: Features + Clustering
    def run_phase1(self) -> None:
        from andria.features.manager_dna import ManagerDNABuilder
        from andria.models.clustering.engine import ClusteringEngine

        if not self._registry.is_ingested():
            raise DataNotFoundError("Processed datasets — run 'andria ingest all' first")

        logger.info("pipeline_phase1_start")
        run_id, run_dir = self._new_run_dir()
        started = datetime.now(timezone.utc)
        params = {
            "min_quarters_active": self._cfg.features.manager_dna.min_quarters_active,
            "clustering": self._cfg.clustering.model_dump(),
        }
        
        try:
            with Progress(
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TimeElapsedColumn(),
            ) as progress:
                p1 = progress.add_task("[cyan]Building Manager DNA features...", total=100)
                
                # Step 1: Build 15-feature Manager DNA
                builder = ManagerDNABuilder(self._cfg)
                dna_df = builder.build()
                progress.update(p1, advance=50, description="[cyan]DNA Built. Saving features...")
                
                out_path = run_dir / "features" / "manager_dna.parquet"
                dna_df.write_parquet(out_path)
                # Symlink latest for downstream consumers
                latest = self._cfg.paths.artifacts / "features"
                latest.mkdir(parents=True, exist_ok=True)
                (latest / "manager_dna.parquet").unlink(missing_ok=True)
                import shutil
                shutil.copy(out_path, latest / "manager_dna.parquet")
                
                progress.update(p1, advance=10, description="[magenta]Running HDBSCAN clustering...")
                
                # Step 2: Clustering + archetype labeling
                engine = ClusteringEngine(self._cfg)
                clustered_df = engine.fit_predict(dna_df)
                
                progress.update(p1, advance=30, description="[magenta]Clustering complete. Saving artifacts...")
                
                clust_path = run_dir / "clusters" / "clustered_managers.parquet"
                clustered_df.write_parquet(clust_path)
                clust_latest = self._cfg.paths.artifacts / "clusters"
                clust_latest.mkdir(parents=True, exist_ok=True)
                shutil.copy(clust_path, clust_latest / "clustered_managers.parquet")
                
                progress.update(p1, advance=10, description="[green]Phase 1 Complete!")

            self._write_manifest(run_dir, run_id, "phase1", params, started)
            logger.info("pipeline_phase1_complete", run_id=run_id)
        except Exception as exc:
            self._write_manifest(
                run_dir, run_id, "phase1", params, started, status="failed", error=str(exc)
            )
            raise PipelineError("phase1", exc) from exc

    # Phase 2: Signals + Regime
    def run_phase2(self) -> None:
        from andria.models.regime.hmm import MacroRegimeDetector
        from andria.signals.racs import RACSEngine

        if not self._registry.is_phase1_complete():
            raise DataNotFoundError("Clustering artifacts — run 'andria run phase1' first")

        logger.info("pipeline_phase2_start")
        run_id, run_dir = self._new_run_dir()
        started = datetime.now(timezone.utc)
        params = {
            "hmm": self._cfg.hmm.model_dump(),
            "racs": self._cfg.signals.racs.model_dump(),
        }
        try:
            with Progress(
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TimeElapsedColumn(),
            ) as progress:
                p2 = progress.add_task("[cyan]Fitting HMM Regime Model...", total=100)

                # Step 1: Fit HMM macro regime model
                detector = MacroRegimeDetector(self._cfg)
                regime_df = detector.fit_predict()
                
                progress.update(p2, advance=40, description="[cyan]HMM Fit. Computing RACS signals...")
                
                regime_path = run_dir / "regime" / "regime_timeseries.parquet"
                regime_df.write_parquet(regime_path)
                regime_latest = self._cfg.paths.artifacts / "regime"
                regime_latest.mkdir(parents=True, exist_ok=True)
                import shutil
                shutil.copy(regime_path, regime_latest / "regime_timeseries.parquet")

                # Step 2: Compute regime-conditioned RACS signals
                racs_engine = RACSEngine(self._cfg)
                racs_df = racs_engine.compute(regime_df)
                
                progress.update(p2, advance=50, description="[magenta]Signals computed. Finalizing...")
                
                racs_path = run_dir / "signals" / "racs_signals.parquet"
                racs_df.write_parquet(racs_path)
                sig_latest = self._cfg.paths.artifacts / "signals"
                sig_latest.mkdir(parents=True, exist_ok=True)
                shutil.copy(racs_path, sig_latest / "racs_signals.parquet")
                
                progress.update(p2, advance=10, description="[green]Phase 2 Complete!")

            self._write_manifest(run_dir, run_id, "phase2", params, started)
            logger.info("pipeline_phase2_complete", run_id=run_id)
        except Exception as exc:
            self._write_manifest(
                run_dir, run_id, "phase2", params, started, status="failed", error=str(exc)
            )
            raise PipelineError("phase2", exc) from exc
