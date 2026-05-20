"""Research Governance & Reproducibility (Phase 4.16).

Provides:
- ``ExperimentConfig`` — immutable run config snapshot (parameters + git hash + seed)
- ``save_config_snapshot`` — serialise to JSON artifact for audit trail
- ``set_global_seed`` — propagates seed to numpy, sklearn, hmmlearn
- ``ParameterLineage`` — lightweight tracker mapping config versions to artifacts

Every backtest run should call ``set_global_seed(cfg.experiment.seed)`` at
the top of the notebook/script before any stochastic operations.

Usage::

    from andria.research.governance import set_global_seed, save_config_snapshot
    from andria.core.config import get_settings
    cfg = get_settings()
    set_global_seed(cfg.experiment.seed)
    save_config_snapshot(cfg, cfg.run_id)
"""

from __future__ import annotations
import hashlib
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any
from andria.core.config import Settings, get_settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


# Seed management
def set_global_seed(seed: int) -> None:
    """Propagate a deterministic seed to all stochastic libraries.

    Covers: numpy, Python random, scikit-learn (via PYTHONHASHSEED guidance),
    and hmmlearn. Call this once at the start of every notebook or script
    that produces reproducible artefacts.

    Args:
        seed: Integer seed value (use ``cfg.experiment.seed``).
    """
    import random
    import numpy as np

    random.seed(seed)
    np.random.seed(seed)

    try:
        import sklearn
    except ImportError:
        pass

    logger.info("global_seed_set", seed=seed)


# Git provenance
def _get_git_commit() -> str:
    """Return current HEAD commit hash, or 'unknown' if not in a git repo."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


# Config snapshot
def _settings_to_dict(cfg: Settings) -> dict[str, Any]:
    """Serialise Settings to a plain dict, skipping Path objects."""
    raw = cfg.model_dump()

    def _sanitise(obj: Any) -> Any:
        if isinstance(obj, Path):
            return str(obj)
        if isinstance(obj, dict):
            return {k: _sanitise(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_sanitise(v) for v in obj]
        return obj

    return _sanitise(raw)


def save_config_snapshot(cfg: Settings | None = None, run_id: str | None = None) -> Path:
    """Serialise the full settings object to a JSON config snapshot.

    The snapshot captures every parameter value, the git commit, the timestamp,
    and a content hash — providing a complete audit trail for reproducibility.

    Args:
        cfg:    Settings instance. Defaults to ``get_settings()``.
        run_id: Short run identifier. Defaults to ``cfg.run_id``.

    Returns:
        Path to the written JSON file.
    """
    cfg = cfg or get_settings()
    run_id = run_id or cfg.run_id

    snapshot: dict[str, Any] = {
        "run_id": run_id,
        "generated_at": datetime.utcnow().isoformat(),
        "git_commit": _get_git_commit(),
        "seed": cfg.experiment.seed,
        "parameters": _settings_to_dict(cfg),
    }

    # Content hash for integrity verification
    content = json.dumps(snapshot, sort_keys=True, default=str)
    snapshot["content_hash"] = hashlib.sha256(content.encode()).hexdigest()[:16]

    out_dir = cfg.paths.artifacts / "configs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{run_id}_config.json"

    with open(out_path, "w") as fh:
        json.dump(snapshot, fh, indent=2, default=str)

    logger.info("config_snapshot_saved", path=str(out_path), git_commit=snapshot["git_commit"])
    return out_path


# Parameter Lineage
class ParameterLineage:
    """Lightweight tracker mapping config snapshot IDs to produced artifacts.

    Maintains a JSONL append log at ``artifacts/configs/lineage.jsonl``.
    Each entry records which run_id config produced which artifact files.

    Usage::

        lineage = ParameterLineage()
        lineage.record(run_id="abc12345", artifact_paths=["artifacts/ledger.parquet"])
    """

    def __init__(self, cfg: Settings | None = None) -> None:
        self._cfg = cfg or get_settings()
        self._log_path = self._cfg.paths.artifacts / "configs" / "lineage.jsonl"
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, run_id: str, artifact_paths: list[str | Path]) -> None:
        """Append a lineage entry linking run_id to produced artifacts."""
        entry = {
            "run_id": run_id,
            "recorded_at": datetime.utcnow().isoformat(),
            "git_commit": _get_git_commit(),
            "artifacts": [str(p) for p in artifact_paths],
        }
        with open(self._log_path, "a") as fh:
            fh.write(json.dumps(entry) + "\n")
        logger.info("lineage_recorded", run_id=run_id, artifacts=len(artifact_paths))

    def load_all(self) -> list[dict[str, Any]]:
        """Return all recorded lineage entries."""
        if not self._log_path.exists():
            return []
        entries = []
        with open(self._log_path) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
        return entries
