import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import plotly.express as px
from andria.core.config import get_settings
from andria.dashboard.data_service import DashboardDataService

dash.register_page(__name__, path="/", name="Overview")

cfg = get_settings()
data_service = DashboardDataService(cfg)

def layout():
    try:
        health = data_service.load_system_health()
        
        # We only try to render if data is HEALTHY
        if health.get("status") != "HEALTHY":
            return dbc.Container([
                dbc.Alert("Pipeline artifacts missing. Run `andria run phase2` first.", color="danger")
            ], className="mt-4")
            
        racs_df = data_service.load_racs_signals(top_n=10)
        regime_df = data_service.load_regime_series()
        cluster_df = data_service.load_clustered_managers()
        
        # Get latest regime
        latest_regime = regime_df.sort("date", descending=True).head(1).to_dicts()[0]
        regime_name = latest_regime["regime_label"]
        
        # Get count of activists
        activist_count = len(cluster_df.filter(cluster_df["archetype_label"].str.contains("Activists")))
        
        return dbc.Container([
            dbc.Row([
                dbc.Col(dbc.Card([
                    dbc.CardBody([
                        html.H6("System Health", className="card-subtitle"),
                        html.H2(health["status"], className="text-success mt-2"),
                        html.Small(f"Artifacts synced.", className="text-muted")
                    ])
                ], className="mb-4 text-center"), width=3),
                
                dbc.Col(dbc.Card([
                    dbc.CardBody([
                        html.H6("Current Macro Regime", className="card-subtitle"),
                        html.H2(regime_name, className="text-info mt-2"),
                        html.Small(f"As of {latest_regime['date']}", className="text-muted")
                    ])
                ], className="mb-4 text-center"), width=3),
                
                dbc.Col(dbc.Card([
                    dbc.CardBody([
                        html.H6("Conviction Activists", className="card-subtitle"),
                        html.H2(activist_count, className="text-warning mt-2"),
                        html.Small("Managers clustered", className="text-muted")
                    ])
                ], className="mb-4 text-center"), width=3),
                
                dbc.Col(dbc.Card([
                    dbc.CardBody([
                        html.H6("Total Signals", className="card-subtitle"),
                        html.H2(str(health["signals"]), className="text-primary mt-2"),
                        html.Small("Regime-adjusted RACS", className="text-muted")
                    ])
                ], className="mb-4 text-center"), width=3),
            ]),
            
            dbc.Row([
                dbc.Col(dbc.Card([
                    dbc.CardHeader("Top Conviction Signals (RACS v2)"),
                    dbc.CardBody([
                        dbc.Table.from_dataframe(
                            racs_df.select(["cusip", "activist_buyers", "regime_adjusted_racs"]).to_pandas(),
                            striped=True, bordered=True, hover=True, size="sm"
                        )
                    ])
                ]), width=6),
                
                dbc.Col(dbc.Card([
                    dbc.CardHeader("Regime Probability History"),
                    dbc.CardBody([
                        dcc.Graph(
                            figure=px.area(
                                regime_df.to_pandas(), 
                                x="date", 
                                y="regime_prob", 
                                color="regime_label",
                                template="plotly_dark",
                                height=350,
                            )
                        )
                    ])
                ]), width=6),
            ])
        ], fluid=True, className="mt-4")
    except Exception as e:
        return dbc.Container([
            dbc.Alert(f"Error loading dashboard: {str(e)}", color="danger")
        ], className="mt-4")
