import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { InsightsData } from "../types";
import { Card, MetricCard } from "./ui/Card";
import { StatusDot } from "./ui/Badge";
import { ErrorAlert } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

const DRIFT_BG: Record<string, string> = {
  green: "#E8F5E9",
  amber: "#FFF8E1",
  red: "#FFEBEE",
};

const DRIFT_TEXT: Record<string, string> = {
  green: "#2E7D32",
  amber: "#F57F17",
  red: "#C62828",
};

export function SystemHealth() {
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
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <ErrorAlert message={error} onRetry={load} />;
  if (!data) return <LoadingSpinner label="Loading system health…" />;

  const health = data.system_health;
  const drift = health.drift;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">System Health</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Model quality metrics and post-event learning loop drift indicator.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="OOF AUC" value={health.oof_auc.toFixed(3)} mono />
        <MetricCard label="Brier Score" value={health.brier.toFixed(3)} mono />
        <MetricCard label="Optimal F1 Threshold" value={health.optimal_threshold.toFixed(3)} mono />
        <MetricCard label="Session Predictions" value={health.session_predictions} mono />
      </div>

      <Card
        className="border-2"
        accent={DRIFT_TEXT[drift.status]}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-label">Post-Event Learning Loop — Drift Indicator</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusDot status={drift.status} />
              <span
                className="text-lg font-bold tracking-wide"
                style={{ color: DRIFT_TEXT[drift.status] }}
              >
                {drift.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-cp-muted">{drift.detail}</p>
          </div>
          <div
            className="rounded-lg px-6 py-4 text-center"
            style={{ backgroundColor: DRIFT_BG[drift.status] }}
          >
            <p className="section-label">OOF Base Rate</p>
            <p className="mt-1 font-mono text-2xl font-bold" style={{ color: DRIFT_TEXT[drift.status] }}>
              {(health.oof_base_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="section-label mb-3">Operational Tier Thresholds</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-cp-border">
              <TierRow tier="TIER 1 — MONITOR" prob="&lt; 20%" color="#2E7D32" action="No immediate action" />
              <TierRow tier="TIER 2 — ALERT" prob="≥ 20%" color="#F9A825" action="Station notified, diversion plan ready" />
              <TierRow tier="TIER 3 — DEPLOY" prob="≥ 45%" color="#EF6C00" action="Barricading + personnel" />
              <TierRow tier="TIER 4 — MAX DEPLOY" prob="≥ 70%" color="#C62828" action="Barricading + diversion + max personnel" />
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="section-label mb-3">Deployment Status</p>
          <ul className="space-y-2 text-sm text-cp-muted">
            <li className="flex justify-between border-b border-cp-border pb-2">
              <span>Inference engine</span>
              <span className="font-mono text-cp-monitor">ONLINE</span>
            </li>
            <li className="flex justify-between border-b border-cp-border pb-2">
              <span>Model artifact</span>
              <span className="font-mono text-cp-navy">clearpath_model.pkl</span>
            </li>
            <li className="flex justify-between border-b border-cp-border pb-2">
              <span>Ensemble</span>
              <span className="font-mono text-cp-navy">LGBM + XGB + RF</span>
            </li>
            <li className="flex justify-between border-b border-cp-border pb-2">
              <span>Calibration</span>
              <span className="font-mono text-cp-navy">Isotonic (OOF)</span>
            </li>
            <li className="flex justify-between">
              <span>Mean fold AUC</span>
              <span className="font-mono font-semibold text-cp-navy">{data.fold_auc_mean.toFixed(3)}</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  prob,
  color,
  action,
}: {
  tier: string;
  prob: string;
  color: string;
  action: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4">
        <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: color }} />
        <span className="font-medium text-cp-navy">{tier}</span>
      </td>
      <td className="py-2 pr-4 font-mono text-xs">{prob}</td>
      <td className="py-2 text-cp-muted">{action}</td>
    </tr>
  );
}
