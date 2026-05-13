import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import plotly.express as px
from andria.core.config import get_settings
from andria.dashboard.data_service import DashboardDataService
dash.register_page(__name__, path="/signals", name="Signals")

cfg = get_settings()
data_service = DashboardDataService(cfg)

def layout():
    try:
        health = data_service.load_system_health()
        if health.get("status") != "HEALTHY":
            return dbc.Container([
                dbc.Alert("Pipeline artifacts missing. Run `andria run phase2` first.", color="danger")
            ], className="mt-4")
            
        racs_df = data_service.load_racs_signals().to_pandas()
        
        # Scatter: conviction_raw (pre-adjustment) vs regime_adjusted_racs (post-adjustment)
        fig_scatter = px.scatter(
            racs_df,
            x="conviction_raw",
            y="regime_adjusted_racs",
            color="crowding_penalty",
            hover_name="cusip",
            size="activist_buyers",
            template="plotly_dark",
            title="RACS Signal Adjustment — Conviction vs Regime-Adjusted Score",
            height=500,
            color_continuous_scale="Viridis",
            labels={
                "conviction_raw": "Raw Conviction Score",
                "regime_adjusted_racs": "Regime-Adjusted RACS",
                "crowding_penalty": "Crowding Penalty",
                "activist_buyers": "Activist Buyers",
            }
        )
        
        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Regime-Conditioned Activist Conviction Scores (RACS)", className="mb-3"),
                    html.P(
                        "Signals are extracted from consensus conviction among 'Conviction Activists', "
                        "discounted by a Gini crowding penalty, and dynamically boosted/dragged by the HMM Macro Regime.",
                        className="text-muted"
                    ),
                    dbc.Card(dcc.Graph(figure=fig_scatter), className="mb-4 shadow-sm"),
                ], width=12)
            ]),
            dbc.Row([
                dbc.Col([
                    dbc.Card([
                        dbc.CardHeader("Complete Signal Ledger"),
                        dbc.CardBody([
                            dbc.Table.from_dataframe(
                                racs_df.head(50),
                                striped=True, bordered=True, hover=True, size="sm"
                            )
                        ])
                    ])
                ])
            ])
        ], fluid=True, className="mt-4")
    except Exception as e:
        return dbc.Container([
            dbc.Alert(f"Error loading dashboard: {str(e)}", color="danger")
        ], className="mt-4")
