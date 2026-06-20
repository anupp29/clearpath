export type Section =
  | "prediction"
  | "map"
  | "dispatch"
  | "insights"
  | "health"
  | "docs";

export interface MetaOptions {
  event_cause: string[];
  event_type: string[];
  priority: string[];
  veh_type: string[];
  corridor: string[];
  police_station: string[];
  zone: string[];
  gba_identifier: string[];
  officer: string[];
  defaults: {
    corridor: string;
    police_station: string;
    zone: string;
    gba_identifier: string;
    officer: string;
    latitude: number;
    longitude: number;
  };
  tier_colors: Record<number, string>;
  risk_tier_colors: Record<string, string>;
}

export interface PredictRequest {
  event_cause: string;
  event_type: string;
  priority: string;
  veh_type: string | null;
  corridor: string;
  police_station: string;
  zone: string;
  gba_identifier: string;
  created_by_id: string;
  latitude: number;
  longitude: number;
  start_datetime: string | null;
}

export interface PredictResponse {
  event_id: string;
  closure_probability: number;
  model_components: {
    lightgbm: number;
    xgboost: number;
    random_forest: number;
    blended_raw: number;
  };
  recommended_tier: string;
  tier_level: number;
  tier_color: string;
  expected_duration_min: number;
  impact_index: number;
}

export interface MapEvent {
  latitude: number;
  longitude: number;
  event_cause: string;
  corridor: string;
  police_station: string;
  event_type: string;
  risk_tier: string;
  closure_probability: number | null;
  impact_index: number;
  start_datetime: string;
  source?: "live" | "historical";
  tier_level?: number;
}

export interface DispatchRow {
  datetime: string;
  cause: string;
  corridor: string;
  station: string;
  type: string;
  priority: string;
  closure_prob: number;
  exp_duration_min: number;
  impact_index: number;
  tier: string;
  tier_num?: number;
  source?: "live" | "historical";
}

export interface ShapRow {
  feature: string;
  mean_abs_shap: number;
}

export interface FoldRow {
  fold: number;
  period: string;
  n_train: number;
  n_val: number;
  pos_val: number;
  AUC: number;
  F1: number;
  Precision: number;
  Recall: number;
  threshold: number;
}

export interface SegmentRow {
  segment: string;
  n: number;
  closures: number;
  AUC: number;
  F1: number;
  Precision: number;
  Recall: number;
  TP: number;
  Total_pos: number;
}

export interface CalibrationBin {
  predicted: number;
  observed: number;
  count: number;
  bin_label: string;
}

export interface DriftStatus {
  status: "green" | "amber" | "red";
  label: string;
  detail: string;
}

export interface InsightsData {
  shap: ShapRow[];
  folds: FoldRow[];
  fold_auc_mean: number;
  segments: SegmentRow[];
  calibration: CalibrationBin[];
  live_session?: {
    predictions: number;
    mean_probability: number | null;
    tier3_plus: number;
    tier4: number;
    max_impact_index: number | null;
  };
  system_health: {
    oof_auc: number;
    brier: number;
    optimal_threshold: number;
    session_predictions: number;
    oof_base_rate: number;
    drift: DriftStatus;
    model_warm?: boolean;
    warmup_ms?: number;
  };
}

export type SampleEvents = Record<string, PredictRequest>;

export interface LivePredictionMarker {
  id: string;
  latitude: number;
  longitude: number;
  event_cause: string;
  corridor: string;
  police_station: string;
  event_type: string;
  closure_probability: number;
  impact_index: number;
  tier_level: number;
  tier_color: string;
  recommended_tier: string;
  risk_tier: string;
  timestamp: string;
}
