"""Andria Systems — Institutional Analytics Dashboard.

A Dash application serving key analytics views:
  /           — Overview and run status
  /dna        — Manager DNA cluster visualization
  /regime     — Macro regime time series
  /signals    — RACS signal leaderboard
  /backtest   — Backtest performance summary

All data is loaded from the latest artifacts in ``artifacts/``. If artifacts
are absent, the dashboard renders placeholder panels with instructions to run
the pipeline first.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, dcc, html

from andria.core.config import Settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


def _load_json(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("dashboard_json_load_failed", path=str(path), error=str(exc))
    return {}


def _load_latest_artifact(artifacts: Path, subdir: str, filename: str) -> dict[str, Any]:
    """Load the most recent artifact from artifacts/runs/*/subdir/filename."""
    runs_root = artifacts / "runs"
    if not runs_root.exists():
        return {}
    run_dirs = sorted(runs_root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    for run_dir in run_dirs:
        candidate = run_dir / subdir / filename
        if candidate.exists():
            data = _load_json(candidate)
            if data:
                return data
    return {}


def _status_badge(label: str, ok: bool) -> dbc.Badge:
    return dbc.Badge(label, color="success" if ok else "secondary", className="me-1")


def create_app(cfg: Settings) -> dash.Dash:
    """Construct and return the Dash application instance.

    Args:
        cfg: Application settings (port, theme, etc.).

    Returns:
        Configured ``dash.Dash`` instance.
    """
    artifacts = cfg.paths.artifacts

    app = dash.Dash(
        __name__,
        external_stylesheets=[dbc.themes.CYBORG],
        suppress_callback_exceptions=True,
        title="Andria Systems",
        meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
    )

    nav = dbc.NavbarSimple(
        brand="Andria Systems",
        brand_href="/",
        color="dark",
        dark=True,
        children=[
            dbc.NavItem(dbc.NavLink("Overview", href="/")),
            dbc.NavItem(dbc.NavLink("Manager DNA", href="/dna")),
            dbc.NavItem(dbc.NavLink("Regime", href="/regime")),
            dbc.NavItem(dbc.NavLink("Signals", href="/signals")),
            dbc.NavItem(dbc.NavLink("Backtest", href="/backtest")),
        ],
    )

    app.layout = html.Div([
        nav,
        dcc.Location(id="url", refresh=False),
        dbc.Container(id="page-content", fluid=True, className="mt-4"),
    ])

    @app.callback(Output("page-content", "children"), Input("url", "pathname"))
    def render_page(pathname: str) -> Any:
        if pathname == "/dna":
            return _dna_page(artifacts)
        if pathname == "/regime":
            return _regime_page(artifacts)
        if pathname == "/signals":
            return _signals_page(artifacts)
        if pathname == "/backtest":
            return _backtest_page(artifacts)
        return _overview_page(artifacts)

    logger.info("dashboard_created", theme="CYBORG")
    return app


# ─── Page renderers ──────────────────────────────────────────────────────────

def _no_data_card(title: str, command: str) -> dbc.Card:
    return dbc.Card(dbc.CardBody([
        html.H5(title, className="card-title text-warning"),
        html.P(f"No artifacts found. Run: {command}", className="text-muted"),
        html.Code(command, className="d-block p-2 bg-dark text-success rounded"),
    ]), className="my-3")


def _overview_page(artifacts: Path) -> Any:
    manifest = _load_latest_artifact(artifacts, "", "manifest.json")
    runs_root = artifacts / "runs"
    n_runs = len(list(runs_root.iterdir())) if runs_root.exists() else 0

    phase1_done = (artifacts / "clusters" / "clustered_managers.parquet").exists()
    phase2_done = (artifacts / "signals" / "racs_signals.parquet").exists()
    regime_done = (artifacts / "regime" / "regime_timeseries.parquet").exists()

    run_id = manifest.get("run_id", "N/A")
    status = manifest.get("status", "N/A")
    git_sha = manifest.get("git_sha", "N/A")

    status_cards = dbc.Row([
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Pipeline Runs", className="text-muted"),
            html.H3(str(n_runs), className="text-info"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Last Run ID", className="text-muted"),
            html.H5(run_id, className="text-light font-monospace"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Status", className="text-muted"),
            dbc.Badge(status.upper(), color="success" if status == "success" else "warning"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Git SHA", className="text-muted"),
            html.Code(git_sha, className="text-success"),
        ])), width=3),
    ], className="mb-4")

    phase_status = dbc.Card(dbc.CardBody([
        html.H5("Phase Status"),
        html.Div([
            _status_badge("Phase 1 (DNA)", phase1_done),
            _status_badge("Phase 2 (Signals)", phase2_done),
            _status_badge("Regime Model", regime_done),
        ]),
        html.Hr(),
        html.Small([
            "Run ",
            html.Code("andria ingest all && andria run phase1 && andria run phase2"),
            " to populate artifacts.",
        ], className="text-muted"),
    ]), className="mb-4")

    return [html.H2("System Overview"), status_cards, phase_status]


def _dna_page(artifacts: Path) -> Any:
    clusters_path = artifacts / "clusters" / "clustered_managers.parquet"
    if not clusters_path.exists():
        return _no_data_card("Manager DNA", "andria run phase1")

    try:
        import polars as pl
        df = pl.read_parquet(clusters_path)
        archetype_counts = (
            df.group_by("archetype_label").len().sort("len", descending=True)
            if "archetype_label" in df.columns else None
        )
    except Exception:
        return _no_data_card("Manager DNA", "andria run phase1")

    rows = []
    if archetype_counts is not None:
        for row in archetype_counts.iter_rows(named=True):
            rows.append(html.Tr([
                html.Td(row["archetype_label"]),
                html.Td(f"{row['len']:,}"),
                html.Td(f"{row['len'] / df.height * 100:.1f}%"),
            ]))

    table = dbc.Table([
        html.Thead(html.Tr([html.Th("Archetype"), html.Th("Count"), html.Th("Share")])),
        html.Tbody(rows),
    ], striped=True, bordered=True, hover=True, color="dark")

    return [
        html.H2("Manager DNA — Behavioral Archetypes"),
        html.P(f"Total managers clustered: {df.height:,}"),
        table,
    ]


def _regime_page(artifacts: Path) -> Any:
    regime_path = artifacts / "regime" / "regime_timeseries.parquet"
    if not regime_path.exists():
        return _no_data_card("Regime Detection", "andria run phase2")

    try:
        import plotly.express as px
        import polars as pl
        df = pl.read_parquet(regime_path)
        fig = px.scatter(
            df.to_pandas(),
            x="date",
            y="regime_prob",
            color="regime_label",
            title="HMM Macro Regime Probabilities",
            template="plotly_dark",
        )
        return [html.H2("Macro Regime Detection"), dcc.Graph(figure=fig)]
    except Exception as exc:
        return [html.H2("Macro Regime Detection"), html.P(f"Error rendering chart: {exc}")]


def _signals_page(artifacts: Path) -> Any:
    signals_path = artifacts / "signals" / "racs_signals.parquet"
    if not signals_path.exists():
        return _no_data_card("RACS Signals", "andria run phase2")

    try:
        import polars as pl
        df = pl.read_parquet(signals_path)
        cols = [
            c for c in ["cusip", "racs_score", "regime_label", "crowding_penalty", "regime_adjusted_racs"]
            if c in df.columns
        ]
        top = (
            df.sort("regime_adjusted_racs", descending=True).head(50).select(cols)
            if "regime_adjusted_racs" in df.columns
            else df.head(50)
        )
        rows = [html.Tr([html.Td(str(v)) for v in row]) for row in top.iter_rows()]
        table = dbc.Table([
            html.Thead(html.Tr([html.Th(c) for c in cols])),
            html.Tbody(rows),
        ], striped=True, bordered=True, hover=True, color="dark", size="sm")
        return [html.H2("RACS Signal Leaderboard"), html.P(f"Top 50 of {df.height:,} signals"), table]
    except Exception as exc:
        return [html.H2("RACS Signals"), html.P(f"Error: {exc}")]


def _backtest_page(artifacts: Path) -> Any:
    summary = _load_json(artifacts / "backtest" / "walk_forward_summary.json")
    gate = _load_json(artifacts / "validation" / "evaluation_gate.json")

    if not summary and not gate:
        return _no_data_card("Backtest Results", "andria run phase3")

    lines = [html.H2("Backtest Results")]

    s = summary.get("summary", {})
    gate_passed = bool(gate.get("gate_passed"))
    lines.append(dbc.Row([
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Annualised Sharpe", className="text-muted"),
            html.H3(f"{s.get('annualized_sharpe', 0):.3f}", className="text-info"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Total Trades", className="text-muted"),
            html.H3(str(s.get("total_trades", 0)), className="text-light"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Portfolio Turnover", className="text-muted"),
            html.H3(f"{s.get('portfolio_turnover_annualized', 0) * 100:.0f}%", className="text-light"),
        ])), width=3),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Evaluation Gate", className="text-muted"),
            dbc.Badge("PASSED" if gate_passed else "FAILED", color="success" if gate_passed else "danger"),
        ])), width=3),
    ], className="mb-4"))

    by_regime = summary.get("metrics_by_regime", {})
    if by_regime:
        rows = [
            html.Tr([
                html.Td(regime.replace("_", " ")),
                html.Td(str(m.get("n_obs", 0))),
                html.Td(f"{m.get('mean_return', 0) * 100:.1f}%"),
                html.Td(f"{m.get('sharpe', 0):.2f}"),
                html.Td("Yes" if m.get("fdr_significant") else "No"),
            ])
            for regime, m in by_regime.items()
        ]
        lines.append(dbc.Table([
            html.Thead(html.Tr([
                html.Th("Regime"), html.Th("Trades"), html.Th("Mean Return"),
                html.Th("Sharpe"), html.Th("FDR Significant"),
            ])),
            html.Tbody(rows),
        ], striped=True, bordered=True, hover=True, color="dark", size="sm"))

    mlflow_uri = artifacts / "mlflow"
    if mlflow_uri.exists():
        lines.append(html.P([
            "MLflow experiment data available. Launch with: ",
            html.Code(f"mlflow ui --backend-store-uri {mlflow_uri}"),
        ]))

    return lines
