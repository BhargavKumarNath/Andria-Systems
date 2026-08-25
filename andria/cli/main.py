"""Andria Systems CLI — single entrypoint for all pipeline operations.

Installed as `andria` via pyproject.toml [project.scripts].

Commands:
    andria ingest edgar          Run EDGAR ingestion + Hive partitioning
    andria ingest fred           Run FRED macro data ingestion
    andria ingest ofr            Run OFR financial stress ingestion
    andria ingest all            Run full ingestion pipeline

    andria run phase1            Build Manager DNA features + clustering
    andria run phase2            Build signals + regime model
    andria run phase3            Backtest + institutional validation (walk-forward, PBO, DSR, Monte Carlo)

    andria validate              Run data contract checks
    andria serve                 Launch Dash dashboard
    andria report                Generate HTML research reports

    andria info                  Print current config + artifact paths
"""

from __future__ import annotations

from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from andria.core.config import get_settings
from andria.core.logging import configure_logging

app = typer.Typer(
    name="andria",
    help="Andria Systems — Institutional Investor Intelligence Platform",
    add_completion=False,
    rich_markup_mode="rich",
)
console = Console()

# Sub-apps
ingest_app = typer.Typer(help="Data ingestion commands")
run_app = typer.Typer(help="Pipeline execution commands")
app.add_typer(ingest_app, name="ingest")
app.add_typer(run_app, name="run")


# Shared options
LogLevel = Annotated[str, typer.Option("--log-level", "-l", help="Logging level")]
JsonLogs = Annotated[bool, typer.Option("--json-logs", help="Emit JSON logs")]


def _setup(log_level: str, json_logs: bool) -> None:
    configure_logging(level=log_level, json_logs=json_logs)


# andria ingest
@ingest_app.command("edgar")
def ingest_edgar(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Ingest raw EDGAR TSV files → Hive-partitioned Parquet."""
    _setup(log_level, json_logs)
    from andria.ingestion.edgar import EDGARIngester

    cfg = get_settings()
    ingester = EDGARIngester(cfg)
    ingester.run()


@ingest_app.command("fred")
def ingest_fred(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Ingest FRED macro CSV files → single Parquet."""
    _setup(log_level, json_logs)
    from andria.ingestion.fred import FREDIngester

    cfg = get_settings()
    FREDIngester(cfg).run()


@ingest_app.command("ofr")
def ingest_ofr(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Ingest OFR financial stress files → single Parquet."""
    _setup(log_level, json_logs)
    from andria.ingestion.ofr import OFRIngester

    cfg = get_settings()
    OFRIngester(cfg).run()


@ingest_app.command("all")
def ingest_all(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Run full ingestion pipeline (EDGAR + FRED + OFR)."""
    _setup(log_level, json_logs)
    from andria.orchestration.pipeline import PipelineOrchestrator

    cfg = get_settings()
    PipelineOrchestrator(cfg).run_ingestion()


# andria run
@run_app.command("phase1")
def run_phase1(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Build Manager DNA features, run HDBSCAN clustering, generate archetype embeddings."""
    _setup(log_level, json_logs)
    from andria.orchestration.pipeline import PipelineOrchestrator

    cfg = get_settings()
    PipelineOrchestrator(cfg).run_phase1()


@run_app.command("phase2")
def run_phase2(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Fit HMM macro regime model, compute RACS signals, build crowding analytics."""
    _setup(log_level, json_logs)
    from andria.orchestration.pipeline import PipelineOrchestrator

    cfg = get_settings()
    PipelineOrchestrator(cfg).run_phase2()


@run_app.command("phase3")
def run_phase3(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Run the backtest + institutional validation stack (leakage audit, execution
    realism, walk-forward, capacity, signal decay, PBO/DSR, Monte Carlo, evaluation
    gate) against real market pricing for the RACS signal universe."""
    _setup(log_level, json_logs)
    from andria.orchestration.pipeline import PipelineOrchestrator

    cfg = get_settings()
    PipelineOrchestrator(cfg).run_phase3()


# andria validate
@app.command("validate")
def validate(
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Run data contract validation checks on processed datasets."""
    _setup(log_level, json_logs)
    from andria.ingestion.registry import DatasetRegistry

    cfg = get_settings()
    registry = DatasetRegistry(cfg)
    results = registry.validate_all()
    table = Table(title="Data Contract Validation")
    table.add_column("Dataset", style="cyan")
    table.add_column("Status", style="bold")
    table.add_column("Detail")
    for name, (ok, detail) in results.items():
        status = "[green]✓ PASS" if ok else "[red]✗ FAIL"
        table.add_row(name, status, detail)
    console.print(table)
    if not all(ok for ok, _ in results.values()):
        raise typer.Exit(code=1)


# andria serve
@app.command("serve")
def serve(
    port: Annotated[int, typer.Option("--port", "-p")] = 0,
    host: Annotated[str, typer.Option("--host")] = "127.0.0.1",
    debug: Annotated[bool, typer.Option("--debug")] = False,
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Launch the Andria institutional analytics dashboard."""
    _setup(log_level, json_logs)
    from andria.dashboard.app import create_app

    cfg = get_settings()
    dash_port = port or cfg.dashboard.port
    dash_debug = debug or cfg.dashboard.debug
    dash_app = create_app(cfg)
    console.print(f"[bold green]Andria Dashboard launching on http://{host}:{dash_port}[/]")
    dash_app.run(host=host, debug=dash_debug, port=dash_port)


# andria report
@app.command("report")
def report(
    run_id: Annotated[str | None, typer.Option("--run-id")] = None,
    log_level: LogLevel = "INFO",
    json_logs: JsonLogs = False,
) -> None:
    """Generate HTML research reports from pipeline artifacts."""
    _setup(log_level, json_logs)
    from andria.research.reports import ReportGenerator

    cfg = get_settings()
    ReportGenerator(cfg).generate(run_id=run_id)


# andria info
@app.command("info")
def info() -> None:
    """Print current configuration and artifact paths."""
    from andria import __version__

    cfg = get_settings()
    table = Table(title=f"Andria Systems v{__version__}")
    table.add_column("Setting", style="cyan")
    table.add_column("Value")
    table.add_row("Project Root", str(cfg.project_root))
    table.add_row("EDGAR Data", str(cfg.paths.raw_edgar))
    table.add_row("Processed", str(cfg.paths.processed))
    table.add_row("Artifacts", str(cfg.paths.artifacts))
    table.add_row("Dashboard Port", str(cfg.dashboard.port))
    table.add_row("HMM States", str(cfg.hmm.n_components))
    table.add_row("Clustering Algorithm", cfg.clustering.algorithm)
    console.print(table)


if __name__ == "__main__":
    app()
