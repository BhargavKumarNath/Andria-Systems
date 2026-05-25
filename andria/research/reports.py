"""Research report generator.

Produces a Markdown research report from pipeline artifacts stored in
``artifacts/``. The report is written to ``artifacts/reports/{run_id}.md``.

If no published runs exist the report covers the most recent run directory.

Usage::

    from andria.research.reports import ReportGenerator
    from andria.core.config import get_settings
    ReportGenerator(get_settings()).generate()
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from andria.core.config import Settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


class ReportGenerator:
    """Generates a Markdown research report from pipeline artifacts."""

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

    def generate(self, run_id: str | None = None) -> Path:
        """Generate the research report and write it to the artifacts directory.

        Args:
            run_id: Specific run ID to report on. If None, uses the most recent run.

        Returns:
            Path to the written Markdown file.
        """
        artifacts = self._cfg.paths.artifacts
        run_dir = self._resolve_run_dir(artifacts, run_id)

        sections: list[str] = [
            self._header(run_dir),
            self._run_manifest_section(run_dir),
            self._phase1_section(run_dir),
            self._phase2_section(run_dir),
            self._backtest_section(run_dir),
            self._provenance_section(run_dir),
            self._footer(),
        ]

        report_text = "\n\n".join(s for s in sections if s)

        out_dir = artifacts / "reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        target_run_id = run_dir.name if run_dir else "unknown"
        out_path = out_dir / f"{target_run_id}.md"
        out_path.write_text(report_text, encoding="utf-8")

        logger.info("report_generated", path=str(out_path), run_id=target_run_id)
        return out_path

    # ------------------------------------------------------------------ helpers

    def _resolve_run_dir(self, artifacts: Path, run_id: str | None) -> Path | None:
        runs_root = artifacts / "runs"
        if run_id:
            candidate = runs_root / run_id
            if candidate.exists():
                return candidate
            logger.warning("run_dir_not_found", run_id=run_id)

        # Fall back to most recent run directory
        if runs_root.exists():
            dirs = sorted(runs_root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
            if dirs:
                return dirs[0]
        return None

    def _load_json(self, path: Path) -> dict[str, Any]:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    # ----------------------------------------------------------------- sections

    def _header(self, run_dir: Path | None) -> str:
        run_label = run_dir.name if run_dir else "N/A"
        generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        return (
            "# Andria Systems — Research Report\n\n"
            f"**Run ID:** `{run_label}`  \n"
            f"**Generated:** {generated}"
        )

    def _run_manifest_section(self, run_dir: Path | None) -> str:
        if run_dir is None:
            return ""
        manifest = self._load_json(run_dir / "manifest.json")
        if not manifest:
            return ""

        lines = ["## Run Manifest", ""]
        lines.append(f"| Key | Value |")
        lines.append(f"|-----|-------|")
        for k, v in manifest.items():
            if k in ("params", "input_hashes"):
                continue
            lines.append(f"| {k} | `{v}` |")
        return "\n".join(lines)

    def _phase1_section(self, run_dir: Path | None) -> str:
        if run_dir is None:
            return ""
        features_path = run_dir / "features" / "manager_dna.parquet"
        clusters_path = run_dir / "clusters" / "clustered_managers.parquet"

        lines = ["## Phase 1 — Manager DNA & Clustering", ""]

        if features_path.exists():
            try:
                import polars as pl
                df = pl.read_parquet(features_path)
                lines.append(f"- **Managers in DNA dataset:** {df.height:,}")
            except Exception:
                lines.append("- Manager DNA parquet found but could not be read.")
        else:
            lines.append("- Manager DNA artifacts not found — run `andria run phase1`.")

        if clusters_path.exists():
            try:
                import polars as pl
                df = pl.read_parquet(clusters_path)
                if "archetype_label" in df.columns:
                    counts = df.group_by("archetype_label").len().sort("len", descending=True)
                    lines.append(f"- **Total clustered managers:** {df.height:,}")
                    lines.append("")
                    lines.append("### Archetype Distribution")
                    lines.append("")
                    lines.append("| Archetype | Count |")
                    lines.append("|-----------|-------|")
                    for row in counts.iter_rows(named=True):
                        lines.append(f"| {row['archetype_label']} | {row['len']:,} |")
            except Exception:
                lines.append("- Clustered managers parquet found but could not be read.")

        return "\n".join(lines)

    def _phase2_section(self, run_dir: Path | None) -> str:
        if run_dir is None:
            return ""
        regime_path = run_dir / "regime" / "regime_timeseries.parquet"
        signals_path = run_dir / "signals" / "racs_signals.parquet"

        lines = ["## Phase 2 — Regime Detection & RACS Signals", ""]

        if regime_path.exists():
            try:
                import polars as pl
                df = pl.read_parquet(regime_path)
                if "regime_label" in df.columns:
                    counts = (
                        df.group_by("regime_label")
                        .len()
                        .sort("len", descending=True)
                    )
                    lines.append(f"- **Regime observations:** {df.height:,} quarters")
                    lines.append("")
                    lines.append("### Regime Distribution")
                    lines.append("")
                    lines.append("| Regime | Quarters |")
                    lines.append("|--------|----------|")
                    for row in counts.iter_rows(named=True):
                        pct = row["len"] / df.height * 100
                        lines.append(f"| {row['regime_label']} | {row['len']} ({pct:.1f}%) |")
            except Exception:
                lines.append("- Regime time series found but could not be read.")
        else:
            lines.append("- Regime artifacts not found — run `andria run phase2`.")

        if signals_path.exists():
            try:
                import polars as pl
                df = pl.read_parquet(signals_path)
                lines.append("")
                lines.append(f"- **RACS signals generated:** {df.height:,}")
                if "racs_final" in df.columns:
                    stats = df["racs_final"].describe()
                    lines.append(
                        f"- **RACS score range:** "
                        f"{df['racs_final'].min():.3f} – {df['racs_final'].max():.3f}"
                    )
            except Exception:
                lines.append("- RACS signals parquet found but could not be read.")

        return "\n".join(lines)

    def _backtest_section(self, run_dir: Path | None) -> str:
        if run_dir is None:
            return ""
        # Look for backtest results in the MLflow artifacts or provenance dir
        mlflow_uri = self._cfg.experiment.mlflow_tracking_uri
        mlflow_path = self._cfg.paths.artifacts / mlflow_uri if not Path(mlflow_uri).is_absolute() else Path(mlflow_uri)

        lines = ["## Phase 4 — Backtest Results", ""]

        if mlflow_path.exists():
            lines.append(f"- MLflow experiment tracking available at `{mlflow_path}`")
            lines.append(f"- Run `mlflow ui --backend-store-uri {mlflow_path}` to browse runs")
        else:
            lines.append("- No backtest artifacts found. Run `andria run phase2` then execute the backtest engine.")

        return "\n".join(lines)

    def _provenance_section(self, run_dir: Path | None) -> str:
        if run_dir is None:
            return ""
        prov_dir = self._cfg.paths.artifacts / "provenance"
        if not prov_dir.exists():
            return ""

        prov_files = sorted(prov_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not prov_files:
            return ""

        latest = self._load_json(prov_files[0])
        if not latest:
            return ""

        lines = ["## Data Provenance", ""]
        lines.append(f"| Metric | Value |")
        lines.append(f"|--------|-------|")
        lines.append(f"| Total CUSIPs | {latest.get('total_cusips', 'N/A')} |")
        lines.append(f"| Mapped | {latest.get('mapped_count', 'N/A')} |")
        lines.append(f"| Unmapped | {latest.get('unmapped_count', 'N/A')} |")
        lines.append(f"| Coverage % | {latest.get('coverage_pct', 'N/A'):.1f}% |" if isinstance(latest.get('coverage_pct'), float) else f"| Coverage % | N/A |")
        lines.append(f"| Stale | {latest.get('stale_count', 'N/A')} |")

        return "\n".join(lines)

    def _footer(self) -> str:
        return (
            "---\n\n"
            "*Generated by Andria Systems research pipeline. "
            "All results are subject to the EvaluationGate publication criteria.*"
        )
