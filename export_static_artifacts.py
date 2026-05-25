"""Export static JSON artifacts for the Next.js frontend.

Reads from the latest pipeline artifacts (Parquet files in ``artifacts/``) and
writes summarised JSON to ``frontend/public/data/``. The frontend loads these
files at build/request time — no backend API call required.

Run this after completing ``andria run phase2`` to refresh the frontend data.

Usage::
    python export_static_artifacts.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
ARTIFACTS = PROJECT_ROOT / "artifacts"
OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "data"

_PLACEHOLDER_NOTE = "Run 'andria run phase2' to populate real data."


def _read_parquet_safe(path: Path) -> object | None:
    if not path.exists():
        return None
    try:
        import polars as pl
        return pl.read_parquet(path)
    except Exception as exc:
        print(f"  [WARN] Could not read {path.name}: {exc}")
        return None


def _latest_run_file(subdir: str, filename: str) -> Path | None:
    runs = ARTIFACTS / "runs"
    if not runs.exists():
        return None
    dirs = sorted(runs.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    for d in dirs:
        p = d / subdir / filename
        if p.exists():
            return p
    return None


def export_signals() -> None:
    path = _latest_run_file("signals", "racs_signals.parquet") or (ARTIFACTS / "signals" / "racs_signals.parquet")
    df = _read_parquet_safe(path) if path else None

    if df is not None:
        import polars as pl
        assert isinstance(df, pl.DataFrame)
        cols = [c for c in ["cusip", "racs_final", "regime_label", "regime_adjusted_racs", "crowding_penalty"] if c in df.columns]
        top = df.sort("racs_final", descending=True).head(500).select(cols) if "racs_final" in df.columns else df.head(500).select(cols)
        signals_list = top.to_dicts()
        data: dict = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_signals": df.height,
            "note": None,
            "signals": signals_list,
        }
    else:
        data = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_signals": 0,
            "note": _PLACEHOLDER_NOTE,
            "signals": [],
        }

    _write(OUT_DIR / "signals.json", data)
    print("  OK  signals.json")


def export_regimes() -> None:
    path = _latest_run_file("regime", "regime_timeseries.parquet") or (ARTIFACTS / "regime" / "regime_timeseries.parquet")
    df = _read_parquet_safe(path) if path else None

    if df is not None:
        import polars as pl
        assert isinstance(df, pl.DataFrame)
        latest = df.sort("date", descending=True).head(1).to_dicts()
        regime_dist = (
            df.group_by("regime_label").len()
            .sort("len", descending=True)
            .to_dicts()
        ) if "regime_label" in df.columns else []
        data: dict = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_observations": df.height,
            "note": None,
            "current": latest[0] if latest else {},
            "distribution": regime_dist,
        }
    else:
        data = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_observations": 0,
            "note": _PLACEHOLDER_NOTE,
            "current": {},
            "distribution": [],
        }

    _write(OUT_DIR / "regimes.json", data)
    print("  OK  regimes.json")


def export_clusters() -> None:
    path = _latest_run_file("clusters", "clustered_managers.parquet") or (ARTIFACTS / "clusters" / "clustered_managers.parquet")
    df = _read_parquet_safe(path) if path else None

    if df is not None:
        import polars as pl
        assert isinstance(df, pl.DataFrame)
        if "archetype_label" in df.columns:
            counts = df.group_by("archetype_label").len().sort("len", descending=True).to_dicts()
        else:
            counts = []
        umap_cols = [c for c in ["umap_1", "umap_2", "archetype_label", "cluster_id"] if c in df.columns]
        # Downsample UMAP points to 2000 max for browser rendering
        sample = df.select(umap_cols).sample(min(2000, df.height), seed=42).to_dicts() if umap_cols else []
        data: dict = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_managers": df.height,
            "note": None,
            "archetypes": counts,
            "umap_sample": sample,
        }
    else:
        data = {
            "generated_at": datetime.now(UTC).isoformat(),
            "total_managers": 0,
            "note": _PLACEHOLDER_NOTE,
            "archetypes": [],
            "umap_sample": [],
        }

    _write(OUT_DIR / "clusters.json", data)
    print("  OK  clusters.json")


def export_portfolio() -> None:
    # Portfolio metrics live in the backtest ledger — surface high-level stats
    data: dict = {
        "generated_at": datetime.now(UTC).isoformat(),
        "note": _PLACEHOLDER_NOTE,
        "portfolio": {},
    }
    _write(OUT_DIR / "portfolio.json", data)
    print("  OK  portfolio.json (placeholder — run backtest engine to populate)")


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def main() -> None:
    print(f"Exporting static artifacts → {OUT_DIR}")
    if not ARTIFACTS.exists():
        print(f"  [WARN] Artifacts directory not found at {ARTIFACTS}.")
        print("         Pipeline has not been run yet. Writing placeholder files.")

    export_signals()
    export_regimes()
    export_clusters()
    export_portfolio()

    print("\nExport complete.")


if __name__ == "__main__":
    main()
