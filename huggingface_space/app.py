"""
app.py
ClearPath AI — Bengaluru Traffic Police | PS-2, Gridlock Hackathon 2.0

Gradio Blocks dashboard. Pure Python — no hand-written HTML page, only a small CSS
override block (Gradio's documented way to theme an app) so the Space looks like an
operations console rather than a generic ML demo.

Run locally:    python app.py
Deploy:         push this folder to a Hugging Face Space with the Docker or Gradio SDK
                (see ../DEPLOY_TO_HUGGINGFACE.md for the exact commands)
"""

import json
from datetime import datetime

import gradio as gr
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from inference import (
    get_engine,
    EVENT_CAUSE_OPTIONS,
    VEH_TYPE_OPTIONS,
    PRIORITY_OPTIONS,
    EVENT_TYPE_OPTIONS,
)

ENGINE = get_engine()

DATA_DIR = __file__.replace("app.py", "data/")
oof_df = pd.read_csv(DATA_DIR + "oof_predictions_full.csv")
dispatch_df = pd.read_csv(DATA_DIR + "dispatch_plan.csv")
shap_df = pd.read_csv(DATA_DIR + "feature_importance_shap.csv")
shap_df.columns = ["feature", "mean_abs_shap"]
fold_df = pd.read_csv(DATA_DIR + "fold_results.csv")
segment_df = pd.read_csv(DATA_DIR + "segment_performance.csv")
segment_df.rename(columns={segment_df.columns[0]: "segment"}, inplace=True)

CORRIDOR_OPTIONS = sorted(ENGINE.te_maps["corridor"].keys())
ZONE_OPTIONS = sorted(ENGINE.te_maps["zone"].keys())
PS_OPTIONS = sorted(ENGINE.te_maps["police_station"].keys())
GBA_OPTIONS = sorted(ENGINE.te_maps["gba_identifier"].keys())
OFFICER_OPTIONS = sorted(ENGINE.te_maps["officer"].keys())

TIER_COLORS = {
    "TIER 1 - MONITOR: no immediate action": "#2E7D32",
    "TIER 2 - ALERT: station notified, diversion plan ready": "#F9A825",
    "TIER 3 - DEPLOY: barricading + personnel": "#EF6C00",
    "TIER 4 - DEPLOY: barricading + diversion + max personnel": "#C62828",
}

CUSTOM_CSS = """
:root {
  --cp-navy: #0B2545;
  --cp-blue: #1565C0;
  --cp-bg: #F4F7FB;
  --cp-card: #FFFFFF;
  --cp-border: #DCE3ED;
}
.gradio-container { background: var(--cp-bg) !important; font-family: 'Inter','Segoe UI',sans-serif !important; }
#cp-header {
  background: linear-gradient(90deg, var(--cp-navy) 0%, var(--cp-blue) 100%);
  color: #fff; padding: 18px 24px; border-radius: 10px; margin-bottom: 14px;
}
#cp-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.3px; }
#cp-header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
.cp-card { background: var(--cp-card); border: 1px solid var(--cp-border); border-radius: 10px; padding: 14px !important; }
.cp-metric-value { font-size: 30px; font-weight: 700; color: var(--cp-navy); }
.cp-metric-label { font-size: 12px; color: #5C6B7A; text-transform: uppercase; letter-spacing: 0.5px; }
footer { display: none !important; }
"""

HEADER_HTML = """
<div id="cp-header">
  <h1>ClearPath AI &nbsp;|&nbsp; Event-Driven Road Closure Risk Engine</h1>
  <p>Bengaluru Traffic Police · ASTraM data partner · PS-2, Gridlock Hackathon 2.0 — inference-only console, model trained offline</p>
</div>
"""


def make_gauge(prob: float, tier_label: str) -> go.Figure:
    color = TIER_COLORS.get(tier_label, "#1565C0")
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=prob * 100,
        number={"suffix": "%", "font": {"size": 36, "color": "#0B2545"}},
        gauge={
            "axis": {"range": [0, 100], "tickwidth": 1, "tickcolor": "#5C6B7A"},
            "bar": {"color": color, "thickness": 0.32},
            "bgcolor": "white",
            "borderwidth": 1,
            "bordercolor": "#DCE3ED",
            "steps": [
                {"range": [0, 20], "color": "#E8F5E9"},
                {"range": [20, 45], "color": "#FFF8E1"},
                {"range": [45, 70], "color": "#FFE0B2"},
                {"range": [70, 100], "color": "#FFCDD2"},
            ],
        },
        title={"text": "Closure Probability", "font": {"size": 14, "color": "#5C6B7A"}},
    ))
    fig.update_layout(height=240, margin=dict(l=20, r=20, t=40, b=10), paper_bgcolor="white")
    return fig


def make_component_bar(components: dict) -> go.Figure:
    names = ["LightGBM", "XGBoost", "Random Forest"]
    vals = [components["lightgbm"], components["xgboost"], components["random_forest"]]
    fig = px.bar(x=vals, y=names, orientation="h", color=names,
                 color_discrete_sequence=["#1565C0", "#0B2545", "#5C8FD9"])
    fig.update_layout(showlegend=False, height=200, margin=dict(l=10, r=10, t=10, b=10),
                       paper_bgcolor="white", plot_bgcolor="white",
                       xaxis_title="Raw probability", yaxis_title="")
    return fig


def run_prediction(event_cause, event_type, priority, veh_type, corridor, police_station,
                    zone, gba, officer, latitude, longitude, start_datetime):
    event = {
        "event_cause": event_cause,
        "event_type": event_type,
        "priority": priority,
        "veh_type": veh_type if veh_type != "(unspecified)" else None,
        "corridor": corridor,
        "police_station": police_station,
        "zone": zone,
        "gba_identifier": gba,
        "created_by_id": officer,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "start_datetime": start_datetime or datetime.utcnow().isoformat() + "Z",
    }
    out = ENGINE.predict(event)

    gauge = make_gauge(out["closure_probability"], out["recommended_tier"])
    bar = make_component_bar(out["model_components"])

    tier_html = f"""
    <div class="cp-card" style="border-left:6px solid {TIER_COLORS.get(out['recommended_tier'], '#1565C0')}">
      <div class="cp-metric-label">Recommended Action</div>
      <div style="font-size:18px;font-weight:700;color:#0B2545;margin-top:4px;">{out['recommended_tier']}</div>
    </div>
    """
    metrics_html = f"""
    <div style="display:flex; gap:14px; margin-top:10px;">
      <div class="cp-card" style="flex:1;">
        <div class="cp-metric-label">Expected Duration</div>
        <div class="cp-metric-value">{out['expected_duration_min']} <span style="font-size:14px;">min</span></div>
      </div>
      <div class="cp-card" style="flex:1;">
        <div class="cp-metric-label">Impact Index (0-100)</div>
        <div class="cp-metric-value">{out['impact_index']}</div>
      </div>
    </div>
    """
    raw_json = json.dumps(out, indent=2, default=str)
    return gauge, bar, tier_html, metrics_html, raw_json


def filtered_map(event_type_filter, tier_filter):
    df = oof_df.copy()
    if event_type_filter and event_type_filter != "All":
        df = df[df["event_type"] == event_type_filter]
    if tier_filter and tier_filter != "All":
        df = df[df["risk_tier"] == tier_filter]
    df = df.dropna(subset=["latitude", "longitude"])
    fig = px.scatter_mapbox(
        df, lat="latitude", lon="longitude", color="risk_tier",
        hover_data=["event_cause", "corridor", "police_station", "oof_prob_calibrated"],
        color_discrete_map={"Low": "#2E7D32", "Medium": "#F9A825", "High": "#EF6C00", "Critical": "#C62828"},
        zoom=10, height=560,
    )
    fig.update_layout(mapbox_style="carto-positron", margin=dict(l=0, r=0, t=0, b=0),
                       legend=dict(orientation="h", yanchor="bottom", y=1.02))
    return fig


def shap_chart():
    top = shap_df.sort_values("mean_abs_shap", ascending=False).head(15).iloc[::-1]
    fig = px.bar(top, x="mean_abs_shap", y="feature", orientation="h",
                 color_discrete_sequence=["#1565C0"])
    fig.update_layout(height=480, margin=dict(l=10, r=10, t=30, b=10),
                       paper_bgcolor="white", plot_bgcolor="white",
                       title="Top 15 Features — Mean |SHAP value|")
    return fig


def fold_chart():
    fig = px.bar(fold_df, x="fold", y="AUC", color_discrete_sequence=["#1565C0"])
    fig.add_hline(y=fold_df["AUC"].mean(), line_dash="dash", line_color="#C62828",
                  annotation_text=f"mean {fold_df['AUC'].mean():.3f}")
    fig.update_layout(height=320, margin=dict(l=10, r=10, t=30, b=10),
                       paper_bgcolor="white", plot_bgcolor="white",
                       title="Temporal CV — Validation AUC per Fold (train = past, validate = future)")
    return fig


THEME = gr.themes.Soft(
    primary_hue="blue",
    neutral_hue="slate",
    font=[gr.themes.GoogleFont("Inter"), "ui-sans-serif", "system-ui"],
)

with gr.Blocks(theme=THEME, css=CUSTOM_CSS, title="ClearPath AI — BTP Traffic Console") as demo:
    gr.HTML(HEADER_HTML)

    with gr.Tabs():
        with gr.Tab("Live Risk Prediction"):
            gr.Markdown("Score a new ASTraM event the moment it is logged — before the closure decision is known.")
            with gr.Row():
                with gr.Column(scale=1):
                    event_cause = gr.Dropdown(EVENT_CAUSE_OPTIONS, value="construction", label="Event Cause")
                    event_type = gr.Radio(EVENT_TYPE_OPTIONS, value="planned", label="Event Type")
                    priority = gr.Radio(PRIORITY_OPTIONS, value="Low", label="Priority")
                    veh_type = gr.Dropdown(["(unspecified)"] + VEH_TYPE_OPTIONS, value="(unspecified)", label="Vehicle Type")
                    officer = gr.Dropdown(OFFICER_OPTIONS, value=OFFICER_OPTIONS[0], label="Logging Officer (created_by_id)")
                with gr.Column(scale=1):
                    corridor = gr.Dropdown(CORRIDOR_OPTIONS, value="Non-corridor" if "Non-corridor" in CORRIDOR_OPTIONS else CORRIDOR_OPTIONS[0], label="Corridor")
                    police_station = gr.Dropdown(PS_OPTIONS, value=PS_OPTIONS[0], label="Police Station")
                    zone = gr.Dropdown(ZONE_OPTIONS, value=ZONE_OPTIONS[0], label="Zone")
                    gba = gr.Dropdown(GBA_OPTIONS, value=GBA_OPTIONS[0], label="GBA Identifier")
                    start_datetime = gr.Textbox(label="Start Datetime (UTC, ISO format)", placeholder="2026-06-20T18:30:00Z")
                with gr.Column(scale=1):
                    latitude = gr.Number(value=12.9716, label="Latitude")
                    longitude = gr.Number(value=77.5946, label="Longitude")
                    predict_btn = gr.Button("Predict Closure Risk", variant="primary")

            with gr.Row():
                with gr.Column(scale=1):
                    gauge_plot = gr.Plot(label="Closure Probability")
                with gr.Column(scale=1):
                    bar_plot = gr.Plot(label="Model Ensemble Breakdown")
            tier_box = gr.HTML()
            metrics_box = gr.HTML()
            with gr.Accordion("Raw model output (JSON, for API consumers / judges)", open=False):
                raw_output = gr.Code(language="json")

            predict_btn.click(
                run_prediction,
                inputs=[event_cause, event_type, priority, veh_type, corridor, police_station,
                        zone, gba, officer, latitude, longitude, start_datetime],
                outputs=[gauge_plot, bar_plot, tier_box, metrics_box, raw_output],
            )

        with gr.Tab("Hotspot Map"):
            gr.Markdown("Out-of-fold predictions plotted across Bengaluru — the same view a control-room operator would scan.")
            with gr.Row():
                et_filter = gr.Dropdown(["All"] + sorted(oof_df["event_type"].dropna().unique().tolist()), value="All", label="Event Type")
                tier_filter_dd = gr.Dropdown(["All", "Low", "Medium", "High", "Critical"], value="All", label="Risk Tier")
            map_plot = gr.Plot()
            demo.load(filtered_map, inputs=[et_filter, tier_filter_dd], outputs=map_plot)
            et_filter.change(filtered_map, inputs=[et_filter, tier_filter_dd], outputs=map_plot)
            tier_filter_dd.change(filtered_map, inputs=[et_filter, tier_filter_dd], outputs=map_plot)

        with gr.Tab("Dispatch Plan"):
            gr.Markdown(
                f"**{len(dispatch_df)} events** flagged Tier 3+ across the historical log — "
                "the list a shift commander would actually act on, sorted by impact index."
            )
            gr.Dataframe(
                dispatch_df.sort_values("impact_index", ascending=False).head(200),
                wrap=True, max_height=560,
            )

        with gr.Tab("Model Insights"):
            gr.Markdown(
                f"**OOF AUC:** {ENGINE.oof_auc:.3f} &nbsp;|&nbsp; **Brier score:** {ENGINE.brier:.3f} "
                f"&nbsp;|&nbsp; **Optimal F1 threshold:** {ENGINE.optimal_threshold:.3f}"
            )
            with gr.Row():
                gr.Plot(shap_chart())
                gr.Plot(fold_chart())
            gr.Markdown("**Segment-aware evaluation** — the model is not deployed against the full noisy log, it is deployed against operationally relevant segments:")
            gr.Dataframe(segment_df)

        with gr.Tab("About / Methodology"):
            gr.Markdown(
                """
                ### What this Space does
                This dashboard loads **one artifact** — `model/clearpath_model.pkl` — and performs inference only.
                No training happens here. The pickle bundles three blended classifiers (LightGBM, XGBoost,
                Random Forest), an isotonic calibrator, and the smoothed target-encoding maps fitted on the
                full ASTraM event log during offline training in `ClearPath_PS2_Final.ipynb`.

                ### Why three models blended instead of one
                Each tree-based learner has a slightly different inductive bias; equal-weight blending of
                out-of-fold predictions reduces variance without re-introducing the leakage that a stacked
                meta-learner trained on the same folds would risk.

                ### Why probabilities are calibrated
                Raw gradient-boosted probabilities are not directly interpretable as real-world frequencies.
                Isotonic regression, fit on out-of-fold predictions only, corrects this so that "70% closure
                probability" means what a traffic police officer would expect it to mean.

                See the project root `README.md` for the full architecture, EDA, feature engineering audit,
                and leakage investigation this model is built on.
                """
            )

if __name__ == "__main__":
    demo.launch()
