import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import polars as pl
from pydantic import BaseModel, Field


class RunManifest(BaseModel):
    """Manifest tracking a single research run."""
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    experiment_timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    status: str = "running"
    metadata: dict[str, Any] = Field(default_factory=dict)
    validation_status: dict[str, bool] = Field(default_factory=dict)
    
    def is_published(self) -> bool:
        """Return True if the run passed all gates and is published."""
        return self.status == "published"


class ArtifactRegistry:
    """
    Formal artifact management layer tracking run metadata, model outputs,
    and signal states using deterministic JSON and Parquet tracking.
    """
    
    def __init__(self, base_dir: str = "artifacts/registry"):
        self.base_dir = Path(base_dir)
        self.runs_dir = self.base_dir / "runs"
        self.signals_dir = self.base_dir / "signals"
        
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.signals_dir.mkdir(parents=True, exist_ok=True)
        
    def start_run(self, config_metadata: dict[str, Any] | None = None) -> RunManifest:
        """Initialize a new research run."""
        manifest = RunManifest(metadata=config_metadata or {})
        self._save_manifest(manifest)
        return manifest
        
    def update_run(self, manifest: RunManifest) -> None:
        """Update an existing run manifest."""
        self._save_manifest(manifest)
        
    def get_run(self, run_id: str) -> RunManifest | None:
        """Fetch a specific run manifest."""
        path = self.runs_dir / f"{run_id}.json"
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return RunManifest(**data)
        
    def list_published_runs(self) -> list[RunManifest]:
        """Return all manifests that achieved published status."""
        runs = []
        for path in self.runs_dir.glob("*.json"):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                manifest = RunManifest(**data)
                if manifest.is_published():
                    runs.append(manifest)
        # Sort by timestamp descending
        runs.sort(key=lambda x: x.experiment_timestamp, reverse=True)
        return runs
        
    def save_signals(self, run_id: str, signals: pl.DataFrame) -> None:
        """Snapshot the signals dataframe for a specific run."""
        path = self.signals_dir / f"{run_id}.parquet"
        signals.write_parquet(path)
        
    def load_signals(self, run_id: str) -> pl.DataFrame | None:
        """Load the signals dataframe for a specific run."""
        path = self.signals_dir / f"{run_id}.parquet"
        if not path.exists():
            return None
        return pl.read_parquet(path)
        
    def _save_manifest(self, manifest: RunManifest) -> None:
        path = self.runs_dir / f"{manifest.run_id}.json"
        with open(path, "w", encoding="utf-8") as f:
            f.write(manifest.model_dump_json(indent=2))
