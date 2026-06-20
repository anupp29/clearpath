import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api, ApiError } from "../api/client";
import type { InsightsData } from "../types";
import { Card } from "./ui/Card";
import { ErrorAlert } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

export function ModelInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .getInsights()
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorAlert message={error} onRetry={load} />;
  if (!data) return <LoadingSpinner label="Loading model insights…" />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Model Insights</h2>
        <p className="mt-1 text-sm text-cp-muted">
          SHAP feature importance, temporal cross-validation, calibration, and segment performance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="OOF AUC" value={data.system_health.oof_auc.toFixed(3)} />
        <Metric label="Brier Score" value={data.system_health.brier.toFixed(3)} />
        <Metric label="Optimal Threshold" value={data.system_health.optimal_threshold.toFixed(3)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="section-label mb-3">Top 15 Features — Mean |SHAP|</p>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={data.shap} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => v.toFixed(4)} />
              <Bar dataKey="mean_abs_shap" fill="#1565C0" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <p className="section-label mb-3">Temporal CV — Validation AUC per Fold</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.folds} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE3ED" />
              <XAxis dataKey="fold" tick={{ fontSize: 11 }} />
              <YAxis domain={[0.6, 0.9]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine
                y={data.fold_auc_mean}
                stroke="#C62828"
                strokeDasharray="4 4"
                label={{ value: `mean ${data.fold_auc_mean.toFixed(3)}`, position: "right", fontSize: 11 }}
              />
              <Bar dataKey="AUC" fill="#1565C0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-cp-muted">
            Train = past, validate = future. Fold periods: {data.folds.map((f) => f.period).join(" → ")}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <p className="section-label mb-3">Calibration Reliability Diagram</p>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE3ED" />
              <XAxis
                type="number"
                dataKey="predicted"
                name="Predicted"
                domain={[0, 1]}
                tick={{ fontSize: 11 }}
                label={{ value: "Mean predicted probability", position: "bottom", offset: 0, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="observed"
                name="Observed"
                domain={[0, 1]}
                tick={{ fontSize: 11 }}
                label={{ value: "Observed closure rate", angle: -90, position: "insideLeft", fontSize: 11 }}
              />
              <ZAxis type="number" dataKey="count" range={[40, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: number, name: string) =>
                  name === "count" ? v : `${(v * 100).toFixed(1)}%`
                }
              />
              <Scatter name="Bins" data={data.calibration} fill="#1565C0" />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <p className="section-label border-b border-cp-border px-4 py-3">
          Segment-Aware Evaluation
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-cp-bg text-xs uppercase tracking-wide text-cp-muted">
              <tr>
                <th className="px-4 py-2.5">Segment</th>
                <th className="px-4 py-2.5">N</th>
                <th className="px-4 py-2.5">Closures</th>
                <th className="px-4 py-2.5">AUC</th>
                <th className="px-4 py-2.5">F1</th>
                <th className="px-4 py-2.5">Precision</th>
                <th className="px-4 py-2.5">Recall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cp-border">
              {data.segments.map((s) => (
                <tr key={s.segment} className="hover:bg-cp-bg/50">
                  <td className="px-4 py-2 font-medium">{s.segment}</td>
                  <td className="px-4 py-2 font-mono">{s.n}</td>
                  <td className="px-4 py-2 font-mono">{s.closures}</td>
                  <td className="px-4 py-2 font-mono">{s.AUC.toFixed(3)}</td>
                  <td className="px-4 py-2 font-mono">{s.F1.toFixed(3)}</td>
                  <td className="px-4 py-2 font-mono">{s.Precision.toFixed(3)}</td>
                  <td className="px-4 py-2 font-mono">{s.Recall.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="section-label">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-cp-navy">{value}</p>
    </Card>
  );
}
