"""
api.py — FastAPI wrapper for ClearPath AI (Hugging Face Space entry point).

Serves the React dashboard (static/) and JSON API routes that delegate all
inference to inference.py — no modelling logic is duplicated here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict

from inference import (
    EVENT_CAUSE_OPTIONS,
    EVENT_TYPE_OPTIONS,
    PRIORITY_OPTIONS,
    VEH_TYPE_OPTIONS,
    get_engine,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

TIER_COLORS = {
    1: "#2E7D32",
    2: "#F9A825",
    3: "#EF6C00",
    4: "#C62828",
}

RISK_TIER_COLORS = {
    "Low": "#2E7D32",
    "Medium": "#F9A825",
    "High": "#EF6C00",
    "Critical": "#C62828",
}

# ---------------------------------------------------------------------------
# Load engine + reference data once at startup
# ---------------------------------------------------------------------------

ENGINE = get_engine()

oof_df = pd.read_csv(DATA_DIR / "oof_predictions_full.csv")
dispatch_df = pd.read_csv(DATA_DIR / "dispatch_plan.csv")
shap_df = pd.read_csv(DATA_DIR / "feature_importance_shap.csv")
shap_df.columns = ["feature", "mean_abs_shap"]
fold_df = pd.read_csv(DATA_DIR / "fold_results.csv")
segment_df = pd.read_csv(DATA_DIR / "segment_performance.csv")
segment_df.rename(columns={segment_df.columns[0]: "segment"}, inplace=True)

CORRIDOR_OPTIONS = sorted(ENGINE.te_maps["corridor"].keys())
ZONE_OPTIONS = sorted(ENGINE.te_maps["zone"].keys())
PS_OPTIONS = sorted(ENGINE.te_maps["police_station"].keys())
GBA_OPTIONS = sorted(ENGINE.te_maps["gba_identifier"].keys())
OFFICER_OPTIONS = sorted(ENGINE.te_maps["officer"].keys())

_session_probs: list[float] = []
_oof_base_rate = float(oof_df["target"].mean()) if "target" in oof_df.columns else 0.083


def _compute_calibration(n_bins: int = 10) -> list[dict]:
    valid = oof_df.dropna(subset=["target", "oof_prob_calibrated"]).copy()
    valid = valid[valid["oof_prob_calibrated"].notna()]
    if valid.empty:
        return []
    bins = np.linspace(0, 1, n_bins + 1)
    valid["bin"] = pd.cut(valid["oof_prob_calibrated"], bins=bins, include_lowest=True)
    rows = []
    for interval, grp in valid.groupby("bin", observed=True):
        if len(grp) == 0:
            continue
        rows.append({
            "predicted": round(float(grp["oof_prob_calibrated"].mean()), 4),
            "observed": round(float(grp["target"].mean()), 4),
            "count": int(len(grp)),
            "bin_label": str(interval),
        })
    return rows


def _drift_status() -> dict:
    n = len(_session_probs)
    if n < 5:
        return {"status": "green", "label": "STABLE", "detail": "Insufficient session samples for drift check"}
    session_mean = float(np.mean(_session_probs))
    delta = abs(session_mean - _oof_base_rate)
    if delta > 0.15:
        return {
            "status": "red",
            "label": "DRIFT DETECTED",
            "detail": f"Session mean prob {session_mean:.3f} vs OOF base rate {_oof_base_rate:.3f}",
        }
    if delta > 0.08:
        return {
            "status": "amber",
            "label": "MONITOR",
            "detail": f"Session mean prob {session_mean:.3f} drifting from base {_oof_base_rate:.3f}",
        }
    return {
        "status": "green",
        "label": "STABLE",
        "detail": f"Session mean {session_mean:.3f} aligned with OOF base rate {_oof_base_rate:.3f}",
    }


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    event_cause: str = "others"
    event_type: str = "unplanned"
    priority: str = "Low"
    veh_type: Optional[str] = None
    corridor: str = "Unknown"
    police_station: str = "Unknown"
    zone: str = "Unknown"
    gba_identifier: str = "Unknown"
    created_by_id: str = "unk"
    latitude: float = Field(default=12.9716, ge=-90, le=90)
    longitude: float = Field(default=77.5946, ge=-180, le=180)
    start_datetime: Optional[str] = None


class PredictResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    closure_probability: float
    model_components: dict[str, float]
    recommended_tier: str
    tier_level: int
    tier_color: str
    expected_duration_min: float
    impact_index: float


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="ClearPath AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "ClearPathEngine", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/meta/options")
def meta_options():
    return {
        "event_cause": EVENT_CAUSE_OPTIONS,
        "event_type": EVENT_TYPE_OPTIONS,
        "priority": PRIORITY_OPTIONS,
        "veh_type": VEH_TYPE_OPTIONS,
        "corridor": CORRIDOR_OPTIONS,
        "police_station": PS_OPTIONS,
        "zone": ZONE_OPTIONS,
        "gba_identifier": GBA_OPTIONS,
        "officer": OFFICER_OPTIONS,
        "defaults": {
            "corridor": "Non-corridor" if "Non-corridor" in CORRIDOR_OPTIONS else CORRIDOR_OPTIONS[0],
            "police_station": PS_OPTIONS[0],
            "zone": ZONE_OPTIONS[0],
            "gba_identifier": GBA_OPTIONS[0],
            "officer": OFFICER_OPTIONS[0],
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
        "tier_colors": TIER_COLORS,
        "risk_tier_colors": RISK_TIER_COLORS,
    }


@app.post("/api/predict", response_model=PredictResponse)
def predict(body: PredictRequest):
    try:
        event = body.model_dump()
        if not event.get("start_datetime"):
            event["start_datetime"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        out = ENGINE.predict(event)
        _session_probs.append(out["closure_probability"])
        tier_level = out["tier_level"]
        return PredictResponse(
            closure_probability=out["closure_probability"],
            model_components=out["model_components"],
            recommended_tier=out["recommended_tier"],
            tier_level=tier_level,
            tier_color=TIER_COLORS.get(tier_level, "#1565C0"),
            expected_duration_min=out["expected_duration_min"],
            impact_index=out["impact_index"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/predict")
def predict_legacy(body: PredictRequest):
    """Legacy route alias for API consumers referencing POST /predict."""
    return predict(body)


@app.get("/api/map/events")
def map_events(
    event_type: str = Query("All"),
    risk_tier: str = Query("All"),
    limit: int = Query(5000, ge=1, le=10000),
):
    df = oof_df.copy()
    if event_type and event_type != "All":
        df = df[df["event_type"] == event_type]
    if risk_tier and risk_tier != "All":
        df = df[df["risk_tier"] == risk_tier]
    df = df.dropna(subset=["latitude", "longitude"]).head(limit)
    records = []
    for _, row in df.iterrows():
        prob = row.get("oof_prob_calibrated")
        records.append({
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "event_cause": str(row.get("event_cause", "")),
            "corridor": str(row.get("corridor", "")),
            "police_station": str(row.get("police_station", "")),
            "event_type": str(row.get("event_type", "")),
            "risk_tier": str(row.get("risk_tier", "")) if pd.notna(row.get("risk_tier")) else "Low",
            "closure_probability": round(float(prob), 4) if pd.notna(prob) else None,
            "impact_index": round(float(row["impact_index"]), 2) if pd.notna(row.get("impact_index")) else 0,
            "start_datetime": str(row.get("start_datetime", "")),
        })
    return {"events": records, "total": len(records)}


@app.get("/api/dispatch")
def dispatch(
    min_tier: int = Query(3, ge=1, le=4),
    sort_by: str = Query("impact_index"),
    ascending: bool = Query(False),
    limit: int = Query(500, ge=1, le=2000),
):
    df = dispatch_df.copy()
    df["tier_num"] = df["tier"].str.extract(r"TIER (\d)").astype(float)
    df = df[df["tier_num"] >= min_tier]
    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=ascending)
    df = df.head(limit)
    return {"rows": json.loads(df.to_json(orient="records")), "total": len(df)}


@app.get("/api/insights")
def insights():
    shap_top = (
        shap_df.sort_values("mean_abs_shap", ascending=False)
        .head(15)
        .sort_values("mean_abs_shap")
        .to_dict(orient="records")
    )
    folds = fold_df.to_dict(orient="records")
    segments = segment_df.to_dict(orient="records")
    calibration = _compute_calibration()
    drift = _drift_status()
    return {
        "shap": shap_top,
        "folds": folds,
        "fold_auc_mean": round(float(fold_df["AUC"].mean()), 4),
        "segments": segments,
        "calibration": calibration,
        "system_health": {
            "oof_auc": ENGINE.oof_auc,
            "brier": ENGINE.brier,
            "optimal_threshold": ENGINE.optimal_threshold,
            "session_predictions": len(_session_probs),
            "oof_base_rate": round(_oof_base_rate, 4),
            "drift": drift,
        },
    }


@app.get("/api/sample-events")
def sample_events():
    path = BASE_DIR / "sample_events.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Static React SPA (production build in static/)
# ---------------------------------------------------------------------------

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/")
    def spa_root():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path == "predict":
            raise HTTPException(status_code=404, detail="Not found")
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Frontend not built")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=7860, log_level="info")
