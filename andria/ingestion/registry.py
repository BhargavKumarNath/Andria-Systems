"""Dataset registry — path resolution, hash verification, and artifact tracking.

Responsibilities:
- Resolve canonical paths for raw and processed datasets
- Compute and cache SHA-256 hashes for reproducibility
- Validate processed datasets against their expected schemas
- Track which datasets are available (vs. missing) for pipeline gating
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import polars as pl

from andria.core.config import Settings
from andria.core.exceptions import DataNotFoundError
from andria.core.logging import get_logger
from andria.core.schemas import (
    ManagerDNAContract,
    RACSContract,
    RegimeContract,
)

logger = get_logger(__name__)


def _sha256(path: Path, chunk_size: int = 1 << 20) -> str:
    """Compute SHA-256 of a file without loading it into memory."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


class DatasetRegistry:
    """Resolves and validates all dataset paths in the pipeline."""

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

    # Path resolution
    @property
    def edgar_raw(self) -> Path:
        return self._cfg.paths.raw_edgar

    @property
    def fred_raw(self) -> Path:
        return self._cfg.paths.raw_fred

    @property
    def ofr_raw(self) -> Path:
        return self._cfg.paths.raw_ofr

    @property
    def edgar_processed(self) -> Path:
        new_path = self._cfg.paths.processed / "edgar"
        if new_path.exists() and any(new_path.rglob("*.parquet")):
            return new_path
        return self._cfg.paths.processed / "EDGAR_preprocess.parquet"

    @property
    def fred_processed(self) -> Path:
        return self._cfg.paths.processed / "FRED_preprocess.parquet"

    @property
    def ofr_processed(self) -> Path:
        return self._cfg.paths.processed / "OFR_preprocess.parquet"

    @property
    def manager_dna(self) -> Path:
        return self._cfg.paths.artifacts / "features" / "manager_dna.parquet"

    @property
    def clustered_managers(self) -> Path:
        return self._cfg.paths.artifacts / "clusters" / "clustered_managers.parquet"

    @property
    def regime_series(self) -> Path:
        return self._cfg.paths.artifacts / "regime" / "regime_timeseries.parquet"

    @property
    def racs_signals(self) -> Path:
        return self._cfg.paths.artifacts / "signals" / "racs_signals.parquet"

    # Existence checks
    def require(self, path: Path) -> Path:
        """Return path or raise DataNotFoundError if it doesn't exist."""
        if not path.exists():
            raise DataNotFoundError(str(path))
        return path

    def is_ingested(self) -> bool:
        return (
            self.edgar_processed.exists()
            and self.fred_processed.exists()
            and self.ofr_processed.exists()
        )

    def is_phase1_complete(self) -> bool:
        return self.clustered_managers.exists()

    def is_phase2_complete(self) -> bool:
        return self.racs_signals.exists() and self.regime_series.exists()

    # Hash computation
    def hash_dataset(self, path: Path) -> str | None:
        """Return SHA-256 of a single parquet file, or None if missing."""
        if not path.exists() or not path.is_file():
            return None
        return _sha256(path)

    # Schema validation
    def validate_all(self) -> dict[str, tuple[bool, str]]:
        """Run schema checks on all processed datasets. Returns {name: (ok, detail)}."""
        results: dict[str, tuple[bool, str]] = {}

        checks: list[tuple[str, Path, Any]] = [
            ("EDGAR (sample)", self.edgar_processed, None),
            ("FRED", self.fred_processed, None),
            ("OFR", self.ofr_processed, None),
            ("Manager DNA", self.manager_dna, ManagerDNAContract),
            ("Clustered Managers", self.clustered_managers, None),
            ("Regime Series", self.regime_series, RegimeContract),
            ("RACS Signals", self.racs_signals, RACSContract),
        ]

        for name, path, contract in checks:
            if not path.exists():
                results[name] = (False, "Not found — run ingestion/pipeline first")
                continue
            try:
                if contract is not None:
                    # Sample 1000 rows to validate schema without full load
                    sample = (
                        pl.read_parquet(path)
                        if path.is_file()
                        else pl.read_parquet(list(path.rglob("*.parquet"))[0])
                    )
                    contract.validate(sample.head(1000))
                results[name] = (True, f"OK — {path}")
            except Exception as exc:
                results[name] = (False, str(exc))

        return results

    # Artifact manifest entry
    def build_input_hashes(self) -> dict[str, str | None]:
        """Return SHA-256 hashes of all processed inputs for manifest."""
        return {
            "edgar": self.hash_dataset(self.edgar_processed / "data.parquet")
            if (self.edgar_processed / "data.parquet").exists()
            else None,
            "fred": self.hash_dataset(self.fred_processed),
            "ofr": self.hash_dataset(self.ofr_processed),
        }
