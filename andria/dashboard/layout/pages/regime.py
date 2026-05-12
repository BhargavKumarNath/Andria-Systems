import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import plotly.express as px
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
        
        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Macro Regime Detection", className="mb-3"),
                    html.P(
                        "A Gaussian Hidden Markov Model dynamically identifies financial market regimes "
                        "from FRED (Yield Curve, Credit Spreads, VIX) and OFR Financial Stress data. "
                        "Centroids are mapped to semantic configurations via Cosine Similarity.",
                        className="text-muted"
                    ),
                    dbc.Card(dcc.Graph(figure=fig_area), className="mb-4 shadow-sm"),
                ], width=12)
            ]),
            dbc.Row([
                dbc.Col([
                    dbc.Card([
                        dbc.CardHeader("Historical Timeline (Quarterly)"),
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
