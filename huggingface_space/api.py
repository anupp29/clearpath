"""
api.py — FastAPI wrapper for ClearPath AI (Hugging Face Space entry point).

Serves the React dashboard (static/) and JSON API routes that delegate all
inference to inference.py — no modelling logic is duplicated here.
"""

from __future__ import annotations

import json
import time
import uuid
from contextlib import asynccontextmanager
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
    is_engine_warm,
    warmup_engine,
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

# Populated during lifespan — model stays loaded in memory for the process lifetime.
ENGINE = None
oof_df: pd.DataFrame | None = None
dispatch_df: pd.DataFrame | None = None
shap_df: pd.DataFrame | None = None
fold_df: pd.DataFrame | None = None
segment_df: pd.DataFrame | None = None

CORRIDOR_OPTIONS: list[str] = []
ZONE_OPTIONS: list[str] = []
PS_OPTIONS: list[str] = []
GBA_OPTIONS: list[str] = []
OFFICER_OPTIONS: list[str] = []

_warmup_ms: float = 0.0
_started_at: str | None = None
_session_probs: list[float] = []
_live_events: list[dict[str, Any]] = []
_oof_base_rate: float = 0.083


def _prob_to_risk_tier(prob: float) -> str:
    if prob >= 0.70:
        return "Critical"
    if prob >= 0.45:
        return "High"
    if prob >= 0.20:
        return "Medium"
    return "Low"


def _record_live_event(event: dict, out: dict, event_id: str) -> dict:
    row = {
        "id": event_id,
        "latitude": float(event["latitude"]),
        "longitude": float(event["longitude"]),
        "event_cause": event.get("event_cause", "others"),
        "corridor": event.get("corridor", "Unknown"),
        "police_station": event.get("police_station", "Unknown"),
        "zone": event.get("zone", "Unknown"),
        "event_type": event.get("event_type", "unplanned"),
        "priority": event.get("priority", "Low"),
        "closure_probability": out["closure_probability"],
        "impact_index": out["impact_index"],
        "expected_duration_min": out["expected_duration_min"],
        "recommended_tier": out["recommended_tier"],
        "tier_level": out["tier_level"],
        "tier_color": TIER_COLORS.get(out["tier_level"], "#1565C0"),
        "risk_tier": _prob_to_risk_tier(out["closure_probability"]),
        "model_components": out["model_components"],
        "start_datetime": event.get("start_datetime") or datetime.now(timezone.utc).isoformat(),
        "scored_at": datetime.now(timezone.utc).isoformat(),
        "source": "live",
    }
    _live_events.insert(0, row)
    if len(_live_events) > 200:
        del _live_events[200:]
    return row


def _live_dispatch_rows(min_tier: int = 3) -> list[dict]:
    rows = []
    for ev in _live_events:
        if ev["tier_level"] < min_tier:
            continue
        rows.append({
            "datetime": ev["scored_at"],
            "cause": ev["event_cause"],
            "corridor": ev["corridor"],
            "station": ev["police_station"],
            "type": ev["event_type"],
            "priority": ev["priority"],
            "closure_prob": ev["closure_probability"],
            "exp_duration_min": ev["expected_duration_min"],
            "impact_index": ev["impact_index"],
            "tier": ev["recommended_tier"],
            "tier_num": ev["tier_level"],
            "source": "live",
        })
    return rows


def _load_reference_data() -> None:
    global oof_df, dispatch_df, shap_df, fold_df, segment_df, _oof_base_rate
    global CORRIDOR_OPTIONS, ZONE_OPTIONS, PS_OPTIONS, GBA_OPTIONS, OFFICER_OPTIONS

    oof_df = pd.read_csv(DATA_DIR / "oof_predictions_full.csv")
    dispatch_df = pd.read_csv(DATA_DIR / "dispatch_plan.csv")
    shap_df = pd.read_csv(DATA_DIR / "feature_importance_shap.csv")
    shap_df.columns = ["feature", "mean_abs_shap"]
    fold_df = pd.read_csv(DATA_DIR / "fold_results.csv")
    segment_df = pd.read_csv(DATA_DIR / "segment_performance.csv")
    segment_df.rename(columns={segment_df.columns[0]: "segment"}, inplace=True)
    _oof_base_rate = float(oof_df["target"].mean()) if "target" in oof_df.columns else 0.083

    eng = get_engine()
    CORRIDOR_OPTIONS = sorted(eng.te_maps["corridor"].keys())
    ZONE_OPTIONS = sorted(eng.te_maps["zone"].keys())
    PS_OPTIONS = sorted(eng.te_maps["police_station"].keys())
    GBA_OPTIONS = sorted(eng.te_maps["gba_identifier"].keys())
    OFFICER_OPTIONS = sorted(eng.te_maps["officer"].keys())


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


def _live_session_stats() -> dict:
    if not _live_events:
        return {
            "predictions": 0,
            "mean_probability": None,
            "tier3_plus": 0,
            "tier4": 0,
            "max_impact_index": None,
        }
    probs = [e["closure_probability"] for e in _live_events]
    return {
        "predictions": len(_live_events),
        "mean_probability": round(float(np.mean(probs)), 4),
        "tier3_plus": sum(1 for e in _live_events if e["tier_level"] >= 3),
        "tier4": sum(1 for e in _live_events if e["tier_level"] >= 4),
        "max_impact_index": round(max(e["impact_index"] for e in _live_events), 2),
    }


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ENGINE, _warmup_ms, _started_at
    t0 = time.perf_counter()
    ENGINE = get_engine()
    warmup_engine()
    _load_reference_data()
    _warmup_ms = round((time.perf_counter() - t0) * 1000, 1)
    _started_at = datetime.now(timezone.utc).isoformat()
    yield


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

    event_id: str
    closure_probability: float
    model_components: dict[str, float]
    recommended_tier: str
    tier_level: int
    tier_color: str
    expected_duration_min: float
    impact_index: float


app = FastAPI(title="ClearPath AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "engine": "ClearPathEngine",
        "model_warm": is_engine_warm(),
        "warmup_ms": _warmup_ms,
        "started_at": _started_at,
        "live_events": len(_live_events),
        "session_predictions": len(_session_probs),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


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
        "model_warm": is_engine_warm(),
    }


@app.post("/api/predict", response_model=PredictResponse)
def predict(body: PredictRequest):
    if ENGINE is None:
        raise HTTPException(status_code=503, detail="Engine not ready")
    try:
        event = body.model_dump()
        if not event.get("start_datetime"):
            event["start_datetime"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        out = ENGINE.predict(event)
        event_id = str(uuid.uuid4())
        _session_probs.append(out["closure_probability"])
        _record_live_event(event, out, event_id)
        tier_level = out["tier_level"]
        return PredictResponse(
            event_id=event_id,
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
    return predict(body)


@app.get("/api/live/events")
def live_events():
    return {"events": list(_live_events), "total": len(_live_events)}


@app.get("/api/map/events")
def map_events(
    event_type: str = Query("All"),
    risk_tier: str = Query("All"),
    limit: int = Query(10000, ge=1, le=15000, description="Max historical points; 10000 covers full OOF log (~8173 rows)"),
    include_historical: bool = Query(True),
):
    records: list[dict] = []

    for ev in _live_events:
        if event_type != "All" and ev["event_type"] != event_type:
            continue
        if risk_tier != "All" and ev["risk_tier"] != risk_tier:
            continue
        records.append({
            "latitude": ev["latitude"],
            "longitude": ev["longitude"],
            "event_cause": ev["event_cause"],
            "corridor": ev["corridor"],
            "police_station": ev["police_station"],
            "event_type": ev["event_type"],
            "risk_tier": ev["risk_tier"],
            "closure_probability": ev["closure_probability"],
            "impact_index": ev["impact_index"],
            "start_datetime": ev["start_datetime"],
            "source": "live",
            "tier_level": ev["tier_level"],
        })

    live_count = len(records)
    hist_count = 0

    if include_historical:
        remaining = max(0, limit - len(records))
        df = oof_df.copy()
        if event_type != "All":
            df = df[df["event_type"] == event_type]
        if risk_tier != "All":
            df = df[df["risk_tier"] == risk_tier]
        df = df.dropna(subset=["latitude", "longitude"]).head(remaining)
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
                "source": "historical",
            })
        hist_count = len(records) - live_count

    return {
        "events": records,
        "total": len(records),
        "live_total": live_count,
        "historical_total": hist_count,
    }


@app.get("/api/dispatch")
def dispatch(
    min_tier: int = Query(3, ge=1, le=4),
    sort_by: str = Query("impact_index"),
    ascending: bool = Query(False),
    limit: int = Query(500, ge=1, le=2000),
):
    live_rows = _live_dispatch_rows(min_tier)
    df = dispatch_df.copy()
    df["tier_num"] = df["tier"].str.extract(r"TIER (\d)").astype(float)
    df = df[df["tier_num"] >= min_tier]
    df["source"] = "historical"
    hist_rows = json.loads(df.to_json(orient="records"))

    combined = live_rows + hist_rows
    if sort_by in ("impact_index", "closure_prob", "exp_duration_min", "datetime"):
        combined.sort(
            key=lambda r: r.get(sort_by, 0),
            reverse=not ascending,
        )
    combined = combined[:limit]
    return {
        "rows": combined,
        "total": len(combined),
        "live_total": len(live_rows),
        "historical_total": len(hist_rows),
    }


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
        "live_session": _live_session_stats(),
        "system_health": {
            "oof_auc": ENGINE.oof_auc,
            "brier": ENGINE.brier,
            "optimal_threshold": ENGINE.optimal_threshold,
            "session_predictions": len(_session_probs),
            "oof_base_rate": round(_oof_base_rate, 4),
            "drift": drift,
            "model_warm": is_engine_warm(),
            "warmup_ms": _warmup_ms,
        },
    }


@app.get("/api/sample-events")
def sample_events():
    path = BASE_DIR / "sample_events.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/docs/readme")
def docs_readme():
    candidates = [
        DATA_DIR / "project_readme.md",
        BASE_DIR.parent / "README.md",
    ]
    for path in candidates:
        if path.exists():
            content = path.read_text(encoding="utf-8")
            return {"content": content, "source": str(path.name)}
    raise HTTPException(status_code=404, detail="README not found")


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
