"""
inference.py
ClearPath AI — Road Closure Risk Engine (PS-2, Gridlock Hackathon 2.0)

This module is the ONLY place where the trained artifact (clearpath_model.pkl) is touched.
It does not retrain anything. It loads the LightGBM + XGBoost + Random Forest blend,
the isotonic calibrator, the target-encoding maps, and the spatial config that were
produced in ClearPath_PS2_Final.ipynb, and reproduces the exact same feature pipeline
at inference time so that a brand-new ASTraM-style event dict gets the same treatment
a training-time row got.

Two design notes for whoever reads this after the hackathon:

1. DBSCAN (used to assign `spatial_cluster` during training) has no native .predict()
   for unseen points. We approximate it the standard way: at startup we re-fit the same
   DBSCAN config on the historical coordinates (data/astram_reference.csv) and build a
   k-d tree over the labelled points. A new event inherits the cluster of its nearest
   historical neighbour if that neighbour is inside the DBSCAN epsilon radius, otherwise
   it is treated as noise (-1), exactly like a true out-of-sample DBSCAN point would be.

2. `density_6h` / `clos_density_6h` are live, rolling features by design (events in the
   last 6 hours within 1km). In the notebook they are computed once over the full
   historical log. In a deployed system they should be computed from a live ASTraM feed.
   This module keeps a small in-process rolling log (seeded empty) that grows as the
   Space receives prediction requests in a session, and falls back to 0 for a cold
   start — this fallback is the same one documented in the original notebook's
   `predict_new_event` function ("density defaults to 0 when no history is available").
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from scipy.spatial import cKDTree
from sklearn.cluster import DBSCAN

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "clearpath_model.pkl"
REFERENCE_CSV = BASE_DIR / "data" / "astram_reference.csv"

DBSCAN_EPS_KM = 0.150
DBSCAN_MIN_SAMPLES = 5

CAUSE_ORD = {
    'vip_movement': 6, 'public_event': 5, 'protest': 4, 'tree_fall': 3, 'debris': 3,
    'construction': 3, 'procession': 3, 'road_conditions': 2, 'others': 2,
    'water_logging': 2, 'congestion': 1, 'vehicle_breakdown': 1, 'accident': 1, 'pot_holes': 1,
}
VEH_RISK = {
    'bmtc_bus': 1.0, 'ksrtc_bus': 1.0, 'private_bus': 0.9, 'heavy_vehicle': 0.8,
    'truck': 0.8, 'lcv': 0.5, 'private_car': 0.3, 'taxi': 0.3, 'auto': 0.2,
}
HIGH_CLOSURE_CAUSES = {'vip_movement', 'public_event', 'protest', 'procession', 'tree_fall', 'construction'}

EVENT_CAUSE_OPTIONS = sorted(CAUSE_ORD.keys())
VEH_TYPE_OPTIONS = sorted(VEH_RISK.keys())
PRIORITY_OPTIONS = ['Low', 'High']
EVENT_TYPE_OPTIONS = ['unplanned', 'planned']


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    d1 = np.radians(lat2 - lat1)
    d2 = np.radians(lon2 - lon1)
    a = np.sin(d1 / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(d2 / 2) ** 2
    return r * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


class _RollingEventLog:
    """In-process stand-in for a live ASTraM event feed. Used only to compute the
    6-hour / 1km local-density features for incoming events during a Space session."""

    def __init__(self):
        self.timestamps = []  # epoch seconds
        self.lats = []
        self.lons = []
        self.outcomes = []  # calibrated probability used as a soft proxy for "was this risky"

    def push(self, ts_epoch, lat, lon, prob):
        self.timestamps.append(ts_epoch)
        self.lats.append(lat)
        self.lons.append(lon)
        self.outcomes.append(prob)
        # keep last 5000 events only, this is a demo log not a database
        if len(self.timestamps) > 5000:
            self.timestamps = self.timestamps[-5000:]
            self.lats = self.lats[-5000:]
            self.lons = self.lons[-5000:]
            self.outcomes = self.outcomes[-5000:]

    def density(self, ts_epoch, lat, lon, window_seconds=6 * 3600, radius_km=1.0):
        if not self.timestamps:
            return 0.0, 0.0
        ts_arr = np.array(self.timestamps)
        mask = (ts_arr < ts_epoch) & (ts_arr >= ts_epoch - window_seconds)
        if mask.sum() == 0:
            return 0.0, 0.0
        lats = np.array(self.lats)[mask]
        lons = np.array(self.lons)[mask]
        outs = np.array(self.outcomes)[mask]
        d = haversine_km(lats, lons, lat, lon)
        nb = d <= radius_km
        return float(nb.sum()), float(outs[nb].sum())


class ClearPathEngine:
    def __init__(self, model_path: Path = MODEL_PATH, reference_csv: Path = REFERENCE_CSV):
        with open(model_path, "rb") as f:
            self.bundle = pickle.load(f)

        self.models = self.bundle["models"]              # {'lgbm':.., 'xgb':.., 'rf':..}
        self.calibrator = self.bundle["calibrator"]       # IsotonicRegression
        self.te_maps = self.bundle["te_maps"]
        self.feature_cols = self.bundle["feature_cols"]
        self.config = self.bundle["config"]

        self.gm = self.te_maps["gm"]
        self.cbd_lat = self.config["cbd_lat"]
        self.cbd_lon = self.config["cbd_lon"]
        self.ps_lats = np.asarray(self.config["ps_lats"])
        self.ps_lons = np.asarray(self.config["ps_lons"])
        self._ps_tree = cKDTree(np.column_stack([self.ps_lats, self.ps_lons]))

        self.optimal_threshold = float(self.config["optimal_threshold"])
        self.tier_thresholds = self.config["tier_thresholds"]  # impact-index based (t2/t3/t4), kept for reference
        self.oof_auc = float(self.config["oof_auc"])
        self.brier = float(self.config["brier"])

        # Probability-based operational tiers, exactly as defined in the notebook (Section 12)
        self.T2_PROB = 0.20
        self.T3_PROB = 0.45
        self.T4_PROB = 0.70

        self.dur_lookup = self.te_maps["dur_lookup"]
        self.global_dur_mean = float(self.te_maps["global_dur_mean"])

        self.log = _RollingEventLog()
        self._fit_spatial_reference(reference_csv)

    # ------------------------------------------------------------------
    # Spatial clustering for unseen points (see module docstring, note 1)
    # ------------------------------------------------------------------
    def _fit_spatial_reference(self, reference_csv: Path):
        if reference_csv is None or not Path(reference_csv).exists():
            self._cluster_tree = None
            self._cluster_labels = None
            return
        ref = pd.read_csv(reference_csv, low_memory=False)
        ref = ref.dropna(subset=["latitude", "longitude"])
        coords_rad = np.radians(ref[["latitude", "longitude"]].values)
        db = DBSCAN(
            eps=DBSCAN_EPS_KM / 6371.0,
            min_samples=DBSCAN_MIN_SAMPLES,
            algorithm="ball_tree",
            metric="haversine",
        ).fit(coords_rad)
        self._cluster_tree = cKDTree(ref[["latitude", "longitude"]].values)
        self._cluster_labels = db.labels_

    def _assign_cluster(self, lat, lon):
        if self._cluster_tree is None:
            return -1
        dist, idx = self._cluster_tree.query([lat, lon], k=1)
        dist_km = dist * 111.0  # rough degree->km, consistent with training-side approximations
        if dist_km <= DBSCAN_EPS_KM:
            return int(self._cluster_labels[idx])
        return -1

    # ------------------------------------------------------------------
    # Feature engineering (mirrors add_static_features + fold_encode in the notebook,
    # but using the GLOBAL target-encoding maps saved in the bundle instead of refitting)
    # ------------------------------------------------------------------
    def _build_feature_row(self, event: dict) -> dict:
        dt = pd.to_datetime(event.get("start_datetime", datetime.now(timezone.utc)), utc=True, errors="coerce")
        if pd.isna(dt):
            dt = pd.Timestamp.now(tz="UTC")

        hour, dow, month = dt.hour, dt.dayofweek, dt.month
        cause = event.get("event_cause", "others")
        corridor = event.get("corridor", "Unknown")
        ps = event.get("police_station", "Unknown")
        zone = event.get("zone", "Unknown")
        gba = event.get("gba_identifier", "Unknown")
        officer = str(event.get("created_by_id", "unk"))
        etype = event.get("event_type", "unplanned")
        prio = event.get("priority", "Low")
        veh = event.get("veh_type", None)
        lat = float(event.get("latitude", self.cbd_lat))
        lon = float(event.get("longitude", self.cbd_lon))

        dist_cbd_km = float(haversine_km(lat, lon, self.cbd_lat, self.cbd_lon))
        dd, _ = self._ps_tree.query([lat, lon], k=1)
        dist_ps_km = float(dd * 111.0)
        cbd_ring = pd.cut([dist_cbd_km], [0, 3, 7, 12, 18, 999], labels=[0, 1, 2, 3, 4])[0]
        cbd_ring = float(cbd_ring) if not pd.isna(cbd_ring) else 2.0

        spatial_cluster = self._assign_cluster(lat, lon)

        ts_epoch = int(dt.timestamp())
        density_6h, clos_density_6h = self.log.density(ts_epoch, lat, lon)

        is_night = float(hour >= 20 or hour <= 6)
        is_weekend = float(dow >= 5)
        is_peak = float(hour in [7, 8, 9, 17, 18, 19, 20, 21])
        is_planned = float(etype == "planned")
        priority_hi = float(prio == "High")
        veh_risk = VEH_RISK.get(veh, 0.35)
        cause_ord = CAUSE_ORD.get(cause, 1.0)
        is_hc_cause = float(cause in HIGH_CLOSURE_CAUSES)
        is_festival = float(month in [3, 10, 11, 12])
        hour_sin = float(np.sin(2 * np.pi * hour / 24))
        hour_cos = float(np.cos(2 * np.pi * hour / 24))
        month_sin = float(np.sin(2 * np.pi * month / 12))
        month_cos = float(np.cos(2 * np.pi * month / 12))
        cause_x_night = cause_ord * is_night
        planned_x_hc = is_planned * is_hc_cause

        def te(col, key):
            return float(self.te_maps[col].get(key, self.gm))

        event_cause_te = te("event_cause", cause)
        corridor_te = te("corridor", corridor)
        police_station_te = te("police_station", ps)
        zone_te = te("zone", zone)
        gba_identifier_te = te("gba_identifier", gba)
        hour_te = te("hour", str(float(hour)))
        officer_risk_te = te("officer", officer)
        cause_hour_te = te("cause_hour", f"{cause}_{float(hour)}")
        cluster_rate = float(self.te_maps["cluster_rate"].get(spatial_cluster, self.gm))
        grid_cell = f"{int(lat * 100)}_{int(lon * 100)}"
        grid_rate = float(self.te_maps["grid_rate"].get(grid_cell, self.gm))
        cause_te_x_corr_te = event_cause_te * corridor_te
        officer_x_cause_te = officer_risk_te * event_cause_te

        row = {
            "hour": hour, "dow": dow, "month_num": month,
            "is_night": is_night, "is_weekend": is_weekend, "is_peak": is_peak,
            "hour_sin": hour_sin, "hour_cos": hour_cos, "month_sin": month_sin, "month_cos": month_cos,
            "is_planned": is_planned, "priority_hi": priority_hi, "veh_risk": veh_risk,
            "cause_ord": cause_ord, "is_hc_cause": is_hc_cause, "is_festival": is_festival,
            "dist_cbd_km": dist_cbd_km, "dist_ps_km": dist_ps_km, "cbd_ring": cbd_ring,
            "spatial_cluster": spatial_cluster,
            "cause_x_night": cause_x_night, "planned_x_hc": planned_x_hc,
            "event_cause_te": event_cause_te, "corridor_te": corridor_te,
            "police_station_te": police_station_te, "zone_te": zone_te,
            "gba_identifier_te": gba_identifier_te, "hour_te": hour_te,
            "officer_risk_te": officer_risk_te, "cause_hour_te": cause_hour_te,
            "cluster_rate": cluster_rate, "grid_rate": grid_rate,
            "cause_te_x_corr_te": cause_te_x_corr_te, "officer_x_cause_te": officer_x_cause_te,
            "density_6h": density_6h, "clos_density_6h": clos_density_6h,
        }
        return row, ts_epoch, lat, lon, cause, prio

    # ------------------------------------------------------------------
    # Duration & impact, mirrors Section 11 of the notebook
    # ------------------------------------------------------------------
    def _expected_duration(self, cause, priority):
        key = (cause, priority)
        if key in self.dur_lookup:
            return float(self.dur_lookup[key])
        cause_keys = [v for k, v in self.dur_lookup.items() if k[0] == cause]
        if cause_keys:
            return float(np.mean(cause_keys))
        return self.global_dur_mean

    def _assign_tier(self, prob):
        if prob >= self.T4_PROB:
            return "TIER 4 - DEPLOY: barricading + diversion + max personnel", 4
        if prob >= self.T3_PROB:
            return "TIER 3 - DEPLOY: barricading + personnel", 3
        if prob >= self.T2_PROB:
            return "TIER 2 - ALERT: station notified, diversion plan ready", 2
        return "TIER 1 - MONITOR: no immediate action", 1

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def predict(self, event: dict) -> dict:
        row, ts_epoch, lat, lon, cause, prio = self._build_feature_row(event)
        X = pd.DataFrame([row])[self.feature_cols].values

        p_lgb = self.models["lgbm"].predict_proba(X)[:, 1]
        p_xgb = self.models["xgb"].predict_proba(X)[:, 1]
        p_rf = self.models["rf"].predict_proba(X)[:, 1]
        blend = (p_lgb + p_xgb + p_rf) / 3.0
        calibrated = float(self.calibrator.transform(blend)[0])
        calibrated = float(np.clip(calibrated, 0.0, 1.0))

        tier_label, tier_num = self._assign_tier(calibrated)
        exp_duration = self._expected_duration(cause, prio)
        impact_index = calibrated * (exp_duration / max(self.global_dur_mean * 4.5, 1.0)) * 100

        # update rolling log for future density features in this session
        self.log.push(ts_epoch, lat, lon, calibrated)

        return {
            "closure_probability": round(calibrated, 4),
            "model_components": {
                "lightgbm": round(float(p_lgb[0]), 4),
                "xgboost": round(float(p_xgb[0]), 4),
                "random_forest": round(float(p_rf[0]), 4),
                "blended_raw": round(float(blend[0]), 4),
            },
            "recommended_tier": tier_label,
            "tier_level": tier_num,
            "expected_duration_min": round(exp_duration, 1),
            "impact_index": round(float(impact_index), 2),
            "feature_row": row,
        }


_ENGINE = None


def get_engine() -> ClearPathEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = ClearPathEngine()
    return _ENGINE
