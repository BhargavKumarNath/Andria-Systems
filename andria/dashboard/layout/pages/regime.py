import dash
import dash_bootstrap_components as dbc
import plotly.express as px
from dash import dcc, html

from andria.core.config import get_settings
from andria.dashboard.data_service import DashboardDataService

dash.register_page(__name__, path="/regime", name="Regime")

cfg = get_settings()
data_service = DashboardDataService(cfg)

def layout():
    try:
        health = data_service.load_system_health()
        if health.get("status") != "HEALTHY":
            return dbc.Container([
                dbc.Alert("Pipeline artifacts missing. Run `andria run phase2` first.", color="danger")
            ], className="mt-4")
            
        regime_df = data_service.load_regime_series().to_pandas()
        
        # Plot regime probabilities over time
        # Melting the probability columns for stacked area chart
        prob_cols = [c for c in regime_df.columns if c.startswith("prob_")]
        melted = regime_df.melt(id_vars=["date"], value_vars=prob_cols, var_name="Regime", value_name="Probability")
        melted["Regime"] = melted["Regime"].str.replace("prob_", "")
        
        fig_area = px.area(
            melted,
            x="date",
            y="Probability",
            color="Regime",
            template="plotly_dark",
            title="Macro Regime Probabilities (Gaussian HMM)",
            height=600,
            color_discrete_sequence=px.colors.qualitative.Pastel
        )
        
        regime_guide = [
            ("X-axis (Date)", "Quarterly timeline from 2004 onwards based on FRED & OFR macro data."),
            ("Y-axis (Probability)", "Probability (0–1) that the market is in each regime at that point in time. All bands sum to 1."),
            ("Colour bands", "Each colour represents one HMM regime state: Goldilocks, Recovery, Rate Shock, or Recession Fear."),
            ("Band width", "Wider = higher conviction that this regime is active. Thin slivers indicate low-probability regimes."),
            ("Transitions", "Abrupt shifts between dominant colours indicate regime change events (e.g., COVID crash, rate hike cycle)."),
            ("Hover", "Mouse over the chart to see exact probability values at any date."),
        ]

        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Macro Regime Detection", className="mb-1"),
                    html.P(
                        "A Gaussian Hidden Markov Model identifies financial market regimes from "
                        "FRED (Yield Curve, Credit Spreads, VIX) and OFR Financial Stress data. "
                        "Regime centroids are mapped to semantic labels via Cosine Similarity.",
                        className="text-muted mb-3",
                    ),
                ], width=12)
            ]),

            dbc.Row([
                dbc.Col(
                    dbc.Alert([
                        html.Strong("How to interpret this chart  "),
                        html.Br(),
                        html.Ul([
                            html.Li([html.Strong(k + ": "), v])
                            for k, v in regime_guide
                        ], className="mb-0 mt-1"),
                    ], color="secondary", className="py-2 mb-3"),
                    width=12,
                )
            ]),

            dbc.Row([
                dbc.Col(dbc.Card(dcc.Graph(figure=fig_area), className="mb-4 shadow-sm"), width=12),
            ]),
            dbc.Row([
                dbc.Col([
                    dbc.Card([
                        dbc.CardHeader("Historical Timeline (Quarterly) — Most Recent First"),
                        dbc.CardBody([
                            dbc.Table.from_dataframe(
                                regime_df[["date", "regime_label", "regime_prob"]].sort_values("date", ascending=False).head(20),
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
