import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import plotly.express as px
from andria.core.config import get_settings
from andria.dashboard.data_service import DashboardDataService

dash.register_page(__name__, path="/intelligence", name="Intelligence")

cfg = get_settings()
data_service = DashboardDataService(cfg)

def layout():
    try:
        health = data_service.load_system_health()
        if health.get("status") != "HEALTHY":
            return dbc.Container([
                dbc.Alert("Pipeline artifacts missing. Run `andria run phase2` first.", color="danger")
            ], className="mt-4")
            
        cluster_df = data_service.load_clustered_managers().to_pandas()
        racs_df = data_service.load_racs_signals().to_pandas()
        
        # We can show Archetype Composition (Pie) and 
        # Feature Box plots for Archetypes to show behavioral differences
        
        fig_pie = px.pie(
            cluster_df,
            names="archetype_label",
            title="Institutional Capital Allocation by Archetype",
            template="plotly_dark",
            hole=0.4
        )
        
        # Boxplot to show HHI difference across archetypes
        fig_box = px.box(
            cluster_df,
            x="archetype_label",
            y="avg_hhi",
            color="archetype_label",
            template="plotly_dark",
            title="Concentration (HHI) across Archetypes",
            height=400
        )
        
        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Market Intelligence & Crowding", className="mb-3"),
                    html.P(
                        "Deep dive into behavioral profiles of institutional managers.",
                        className="text-muted"
                    )
                ], width=12)
            ]),
            dbc.Row([
                dbc.Col(dbc.Card(dcc.Graph(figure=fig_pie), className="mb-4 shadow-sm"), width=5),
                dbc.Col(dbc.Card(dcc.Graph(figure=fig_box), className="mb-4 shadow-sm"), width=7),
            ]),
        ], fluid=True, className="mt-4")
    except Exception as e:
        return dbc.Container([
            dbc.Alert(f"Error loading dashboard: {str(e)}", color="danger")
        ], className="mt-4")
