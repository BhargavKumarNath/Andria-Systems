"""Andria Systems Dashboard — multi-page Plotly Dash application.

Five pages:
    /           Overview       — KPI cards, macro radar, data health, top signals
    /archetypes Archetypes     — UMAP scatter, feature violin, temporal drift
    /signals    Signals        — RACS heatmap, signal decay, IC over time
    /regime     Regime         — HMM timeline, transition matrix, regime returns
    /intelligence Intelligence — Crowding map, similarity network, overlap Sankey
"""

from __future__ import annotations
import dash
import dash_bootstrap_components as dbc
from andria.core.config import Settings

def create_app(cfg: Settings) -> dash.Dash:
    """Factory function — creates and returns a configured Dash application.

    Args:
        cfg: Andria Settings instance (injected by CLI)

    Returns:
        Configured Dash app ready to run.
    """
    theme_map = {
        "CYBORG": dbc.themes.CYBORG,
        "DARKLY": dbc.themes.DARKLY,
        "SLATE": dbc.themes.SLATE,
    }
    theme = theme_map.get(cfg.dashboard.theme, dbc.themes.CYBORG)

    app = dash.Dash(
        __name__,
        use_pages=True,
        external_stylesheets=[theme, dbc.icons.FONT_AWESOME],
        suppress_callback_exceptions=True,
        title="Andria Systems | Institutional Analytics",
        update_title="",
    )

    from andria.dashboard.layout.header import build_header
    from andria.dashboard.layout.sidebar import build_sidebar

    app.layout = dbc.Container(
        [
            build_header(),
            dbc.Row(
                [
                    dbc.Col(build_sidebar(), width=2, className="sidebar-col"),
                    dbc.Col(dash.page_container, width=10, className="content-col"),
                ],
                className="g-0",
            ),
        ],
        fluid=True,
        className="andria-root",
    )

    # Register callbacks
    from andria.dashboard.callbacks import register_all

    register_all(app, cfg)

    return app
