"""Dashboard header component."""

from __future__ import annotations

import dash_bootstrap_components as dbc
from dash import html


def build_header() -> dbc.Navbar:
    return dbc.Navbar(
        dbc.Container(
            [
                html.A(
                    dbc.Row(
                        [
                            dbc.Col(html.Img(height="30px")),
                            dbc.Col(
                                dbc.NavbarBrand(
                                    "ANDRIA SYSTEMS",
                                    className="ms-2 andria-brand",
                                )
                            ),
                        ],
                        align="center",
                        className="g-0",
                    ),
                    href="/",
                    style={"textDecoration": "none"},
                ),
                dbc.NavbarToggler(id="navbar-toggler"),
                dbc.Collapse(
                    dbc.Nav(
                        [
                            dbc.NavItem(dbc.NavLink("Overview", href="/")),
                            dbc.NavItem(dbc.NavLink("Archetypes", href="/archetypes")),
                            dbc.NavItem(dbc.NavLink("Signals", href="/signals")),
                            dbc.NavItem(dbc.NavLink("Regime", href="/regime")),
                            dbc.NavItem(dbc.NavLink("Intelligence", href="/intelligence")),
                        ],
                        className="ms-auto",
                        navbar=True,
                    ),
                    id="navbar-collapse",
                    navbar=True,
                ),
            ],
            fluid=True,
        ),
        color="dark",
        dark=True,
        sticky="top",
        className="andria-navbar mb-0",
    )
