"""Dashboard sidebar navigation."""

from __future__ import annotations
import dash_bootstrap_components as dbc
from dash import html


_NAV_ITEMS = [
    ("fa-chart-line", "Overview", "/"),
    ("fa-dna", "Archetypes", "/archetypes"),
    ("fa-bolt", "Signals", "/signals"),
    ("fa-wave-square", "Macro Regime", "/regime"),
    ("fa-network-wired", "Intelligence", "/intelligence"),
]


def build_sidebar() -> html.Div:
    nav_links = []
    for icon, label, href in _NAV_ITEMS:
        nav_links.append(
            dbc.NavLink(
                [html.I(className=f"fas {icon} me-2"), label],
                href=href,
                active="exact",
                className="sidebar-link",
            )
        )
    return html.Div(
        [
            html.Div("NAVIGATION", className="sidebar-section-title"),
            dbc.Nav(nav_links, vertical=True, pills=True),
        ],
        className="andria-sidebar",
    )
