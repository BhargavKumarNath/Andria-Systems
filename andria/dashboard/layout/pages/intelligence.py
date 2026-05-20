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
        
        # Showing Archetype Composition (Pie) and 
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
        
        pie_guide = [
            ("Segments", "Each segment is a manager archetype. Larger segment = more managers belong to that group."),
            ("Hover", "Hover over a segment to see the archetype name and manager count."),
            ("Click legend", "Click an archetype name in the legend to hide/show it on the chart."),
        ]
        box_guide = [
            ("X-axis", "Manager archetype (e.g. Conviction Activists, Index Huggers, Noise)."),
            ("Y-axis (HHI)", "Herfindahl-Hirschman Index — portfolio concentration (0 = fully diversified, 1 = single position)."),
            ("Box", "The box spans Q1–Q3. The line inside is the median concentration for that archetype."),
            ("Whiskers", "Extend to 1.5× IQR. Points beyond are outliers (unusually concentrated or diversified managers)."),
            ("Interpretation", "High HHI Conviction Activists signal fewer, larger bets — typical of activist hedge funds."),
        ]

        return dbc.Container([
            dbc.Row([
                dbc.Col([
                    html.H3("Market Intelligence & Crowding", className="mb-1"),
                    html.P(
                        "Deep dive into behavioral profiles of institutional managers across archetypes.",
                        className="text-muted mb-3",
                    )
                ], width=12)
            ]),

            # Pie guide + chart
            dbc.Row([
                dbc.Col(
                    dbc.Alert([
                        html.Strong("Capital Allocation Pie — How to read: "),
                        html.Ul([
                            html.Li([html.Strong(k + ": "), v])
                            for k, v in pie_guide
                        ], className="mb-0 mt-1"),
                    ], color="info", className="py-2 mb-2"),
                    width=5,
                ),
                dbc.Col(
                    dbc.Alert([
                        html.Strong("HHI Boxplot — How to read: "),
                        html.Ul([
                            html.Li([html.Strong(k + ": "), v])
                            for k, v in box_guide
                        ], className="mb-0 mt-1"),
                    ], color="secondary", className="py-2 mb-2"),
                    width=7,
                ),
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
