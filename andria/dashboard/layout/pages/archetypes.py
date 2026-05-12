import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
import plotly.express as px
from andria.core.config import get_settings
from andria.dashboard.data_service import DashboardDataService

dash.register_page(__name__, path="/archetypes", name="Archetypes")

cfg = get_settings()
data_service = DashboardDataService(cfg)

def layout():
    try:
        health = data_service.load_system_health()
        if health.get("status") != "HEALTHY":
            return dbc.Container([
                dbc.Alert("Pipeline artifacts missing. Run `andria run phase1` first.", color="danger")
            ], className="mt-4")
            
        cluster_df = data_service.load_clustered_managers().to_pandas()
        
        # UMAP scatter
        fig_umap = px.scatter(
            cluster_df,
            x="umap_1",
            y="umap_2",
            color="archetype_label",
            hover_name="manager_name",
            hover_data=["avg_hhi", "avg_put_ratio", "log_avg_aum", "cluster_prob"],
            template="plotly_dark",
            title="Institutional Archetype Manifold (UMAP)",
            height=600
        )
        fig_umap.update_traces(marker=dict(size=6, opacity=0.7, line=dict(width=0)))
        
        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Behavioral Archetypes", className="mb-3"),
                    html.P(
                        "This 2D manifold projection (UMAP) visualizes 116M+ holdings "
                        "compressed into 14 behavioral features per manager, clustered via HDBSCAN.",
                        className="text-muted"
                    ),
                    dbc.Card(dcc.Graph(figure=fig_umap), className="mb-4 shadow-sm"),
                ], width=12)
            ])
        ], fluid=True, className="mt-4")
    except Exception as e:
        return dbc.Container([
            dbc.Alert(f"Error loading dashboard: {str(e)}", color="danger")
        ], className="mt-4")
