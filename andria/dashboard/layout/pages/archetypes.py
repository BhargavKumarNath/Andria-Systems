import dash
import dash_bootstrap_components as dbc
import plotly.express as px
from dash import dcc, html

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

        archetype_counts = (
            cluster_df.groupby("archetype_label")
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
        )

        # UMAP scatter — improved readability
        fig_umap = px.scatter(
            cluster_df,
            x="umap_1",
            y="umap_2",
            color="archetype_label",
            hover_name="manager_name",
            hover_data={
                "avg_hhi": ":.3f",
                "log_avg_aum": ":.2f",
                "cluster_prob": ":.2f",
                "umap_1": False,
                "umap_2": False,
            },
            template="plotly_dark",
            title="Institutional Manager Archetypes — UMAP Manifold",
            height=560,
            color_discrete_sequence=px.colors.qualitative.Bold,
        )
        fig_umap.update_traces(
            marker=dict(size=8, opacity=0.82, line=dict(width=0.5, color="rgba(255,255,255,0.25)"))
        )
        fig_umap.update_layout(
            legend=dict(
                title="Archetype",
                orientation="v",
                x=1.01,
                y=0.98,
                bgcolor="rgba(30,30,30,0.8)",
                bordercolor="rgba(255,255,255,0.15)",
                borderwidth=1,
                font=dict(size=12),
            ),
            xaxis=dict(title="UMAP Dimension 1", showgrid=True, gridcolor="rgba(255,255,255,0.07)"),
            yaxis=dict(title="UMAP Dimension 2", showgrid=True, gridcolor="rgba(255,255,255,0.07)"),
            margin=dict(l=40, r=160, t=60, b=40),
        )

        guide_items = [
            ("Each dot", "One institutional manager (14 behavioral features condensed to 2D)."),
            ("Proximity", "Nearby managers behave similarly — distance reflects behavioral difference."),
            ("Colour", "Archetype assigned by cosine-similarity to pre-defined prototype vectors."),
            ("Hover", "Shows manager name, HHI, AUM scale, and cluster membership probability."),
            ("Zoom / Pan", "Use mouse scroll or the Plotly toolbar (top-right) to explore dense areas."),
        ]

        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Behavioral Archetypes", className="mb-1"),
                    html.P(
                        "HDBSCAN clustering over 14 behavioral features, projected to 2-D via UMAP.",
                        className="text-muted mb-3",
                    ),
                ], width=12)
            ]),

            # How-to-read guide
            dbc.Row([
                dbc.Col(
                    dbc.Alert([
                        html.Strong("How to read this chart  "),
                        html.Br(),
                        html.Ul([
                            html.Li([html.Strong(k + ": "), v])
                            for k, v in guide_items
                        ], className="mb-0 mt-1"),
                    ], color="info", className="py-2 mb-3"),
                    width=12,
                )
            ]),

            dbc.Row([
                # UMAP plot
                dbc.Col(
                    dbc.Card(dcc.Graph(figure=fig_umap), className="shadow-sm"),
                    width=9,
                ),
                # Archetype count sidebar
                dbc.Col([
                    dbc.Card([
                        dbc.CardHeader("Archetype Breakdown"),
                        dbc.CardBody(
                            dbc.Table.from_dataframe(
                                archetype_counts.rename(columns={"archetype_label": "Archetype", "count": "Managers"}),
                                striped=True, bordered=False, hover=True, size="sm",
                            )
                        ),
                    ], className="shadow-sm mb-3"),
                    dbc.Card([
                        dbc.CardHeader("Noise / Unclassified"),
                        dbc.CardBody(
                            html.P(
                                "Managers labelled 'Noise' by HDBSCAN lie in sparse regions "
                                "and don't belong to any archetype — they are still shown on the map.",
                                className="small text-muted mb-0",
                            )
                        ),
                    ], className="shadow-sm"),
                ], width=3),
            ], className="mb-4"),
        ], fluid=True, className="mt-4")
    except Exception as e:
        return dbc.Container([
            dbc.Alert(f"Error loading dashboard: {str(e)}", color="danger")
        ], className="mt-4")

