import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../api/client";
import type { MetaOptions, PredictRequest, PredictResponse, SampleEvents } from "../types";
import { Card, MetricCard } from "./ui/Card";
import { TierBadge } from "./ui/Badge";
import { ErrorAlert } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

const MODEL_LABELS = [
  { key: "lightgbm" as const, label: "LightGBM", color: "#1565C0" },
  { key: "xgboost" as const, label: "XGBoost", color: "#0B2545" },
  { key: "random_forest" as const, label: "Random Forest", color: "#5C8FD9" },
];

function Gauge({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const rotation = (pct / 100) * 180 - 90;
  return (
    <div className="relative mx-auto h-44 w-72">
      <svg viewBox="0 0 200 110" className="h-full w-full">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E8F5E9" strokeWidth="14" />
        <path d="M 20 100 A 80 80 0 0 1 100 20" fill="none" stroke="#FFF8E1" strokeWidth="14" />
        <path d="M 100 20 A 80 80 0 0 1 160 60" fill="none" stroke="#FFE0B2" strokeWidth="14" />
        <path d="M 160 60 A 80 80 0 0 1 180 100" fill="none" stroke="#FFCDD2" strokeWidth="14" />
        <line
          x1="100"
          y1="100"
          x2={100 + 70 * Math.cos((rotation * Math.PI) / 180)}
          y2={100 + 70 * Math.sin((rotation * Math.PI) / 180)}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill={color} />
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <p className="font-mono text-4xl font-bold tabular-nums text-cp-navy">
          {(value * 100).toFixed(1)}%
        </p>
        <p className="section-label mt-1">Closure Probability</p>
      </div>
    </div>
  );
}

function emptyForm(defaults: MetaOptions["defaults"]): PredictRequest {
  return {
    event_cause: "construction",
    event_type: "planned",
    priority: "Low",
    veh_type: null,
    corridor: defaults.corridor,
    police_station: defaults.police_station,
    zone: defaults.zone,
    gba_identifier: defaults.gba_identifier,
    created_by_id: defaults.officer,
    latitude: defaults.latitude,
    longitude: defaults.longitude,
    start_datetime: null,
  };
}

export function LivePrediction() {
  const [options, setOptions] = useState<MetaOptions | null>(null);
  const [samples, setSamples] = useState<SampleEvents | null>(null);
  const [form, setForm] = useState<PredictRequest | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getOptions(), api.getSampleEvents()])
      .then(([opts, samp]) => {
        setOptions(opts);
        setSamples(samp);
        setForm(emptyForm(opts.defaults));
      })
      .catch((e: ApiError) => setLoadError(e.message));
  }, []);

  const update = <K extends keyof PredictRequest>(key: K, value: PredictRequest[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const loadSample = (key: string) => {
    if (!samples?.[key]) return;
    const s = samples[key];
    setForm({
      ...s,
      veh_type: s.veh_type ?? null,
      start_datetime: s.start_datetime ?? null,
    });
    setResult(null);
    setError(null);
  };

  const submit = useCallback(async () => {
    if (!form) return;
    setLoading(true);
    setError(null);
    try {
      const payload: PredictRequest = {
        ...form,
        veh_type: form.veh_type || null,
        start_datetime: form.start_datetime?.trim() || null,
      };
      const res = await api.predict(payload);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }, [form]);

  if (loadError) return <ErrorAlert message={loadError} onRetry={() => window.location.reload()} />;
  if (!options || !form) return <LoadingSpinner label="Loading form options…" />;

  const barData = result
    ? MODEL_LABELS.map((m) => ({
        name: m.label,
        value: result.model_components[m.key],
        color: m.color,
      }))
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Live Risk Prediction</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Score a new ASTraM event the moment it is logged — before the closure decision is known.
        </p>
      </div>

      {samples && (
        <div className="flex flex-wrap gap-2">
          {Object.keys(samples).map((key) => (
            <button key={key} type="button" onClick={() => loadSample(key)} className="btn-secondary">
              Load: {key.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <p className="section-label mb-3">Event Details</p>
          <div className="space-y-3">
            <Field label="Event Cause">
              <select className="form-field" value={form.event_cause} onChange={(e) => update("event_cause", e.target.value)}>
                {options.event_cause.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Event Type">
              <div className="flex gap-4">
                {options.event_type.map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="event_type" checked={form.event_type === v} onChange={() => update("event_type", v)} />
                    {v}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Priority">
              <div className="flex gap-4">
                {options.priority.map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="priority" checked={form.priority === v} onChange={() => update("priority", v)} />
                    {v}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Vehicle Type">
              <select
                className="form-field"
                value={form.veh_type ?? ""}
                onChange={(e) => update("veh_type", e.target.value || null)}
              >
                <option value="">(unspecified)</option>
                {options.veh_type.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Officer ID">
              <select className="form-field" value={form.created_by_id} onChange={(e) => update("created_by_id", e.target.value)}>
                {options.officer.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <p className="section-label mb-3">Location &amp; Corridor</p>
          <div className="space-y-3">
            <Field label="Corridor">
              <select className="form-field" value={form.corridor} onChange={(e) => update("corridor", e.target.value)}>
                {options.corridor.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Police Station">
              <select className="form-field" value={form.police_station} onChange={(e) => update("police_station", e.target.value)}>
                {options.police_station.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Zone">
              <select className="form-field" value={form.zone} onChange={(e) => update("zone", e.target.value)}>
                {options.zone.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="GBA Identifier">
              <select className="form-field" value={form.gba_identifier} onChange={(e) => update("gba_identifier", e.target.value)}>
                {options.gba_identifier.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <p className="section-label mb-3">Coordinates &amp; Time</p>
          <div className="space-y-3">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                className="form-field font-mono"
                value={form.latitude}
                onChange={(e) => update("latitude", parseFloat(e.target.value))}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                className="form-field font-mono"
                value={form.longitude}
                onChange={(e) => update("longitude", parseFloat(e.target.value))}
              />
            </Field>
            <Field label="Start Datetime (UTC ISO)">
              <input
                type="text"
                className="form-field font-mono"
                placeholder="2026-06-20T18:30:00Z"
                value={form.start_datetime ?? ""}
                onChange={(e) => update("start_datetime", e.target.value || null)}
              />
            </Field>
            <button type="button" onClick={submit} disabled={loading} className="btn-primary w-full">
              {loading ? "Scoring…" : "Predict Closure Risk"}
            </button>
          </div>
        </Card>
      </div>

      {error && <ErrorAlert message={error} onRetry={submit} />}

      {result && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <Gauge value={result.closure_probability} color={result.tier_color} />
          </Card>
          <Card>
            <p className="section-label mb-2">Model Ensemble Breakdown</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card accent={result.tier_color} className="lg:col-span-2">
            <p className="section-label">Recommended Action</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <TierBadge label={`TIER ${result.tier_level}`} color={result.tier_color} />
              <p className="text-lg font-bold text-cp-navy">{result.recommended_tier}</p>
            </div>
          </Card>

          <MetricCard
            label="Expected Duration"
            value={result.expected_duration_min.toFixed(1)}
            sub="min"
            mono
          />
          <MetricCard
            label="Impact Index"
            value={result.impact_index.toFixed(2)}
            sub="/ 100"
            mono
          />
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-md border border-dashed border-cp-border px-6 py-10 text-center text-sm text-cp-muted">
          Submit an event to see closure probability, tier recommendation, and model breakdown.
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
