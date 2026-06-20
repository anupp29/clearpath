import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, ApiError } from "../api/client";
import type { MapEvent } from "../types";
import { Card } from "./ui/Card";
import { ErrorAlert, EmptyState } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

const RISK_COLORS: Record<string, string> = {
  Low: "#2E7D32",
  Medium: "#F9A825",
  High: "#EF6C00",
  Critical: "#C62828",
};

const BENGALURU_CENTER: [number, number] = [12.9716, 77.5946];

function FitBounds({ events }: { events: MapEvent[] }) {
  const map = useMap();
  useEffect(() => {
    if (events.length === 0) return;
    const lats = events.map((e) => e.latitude);
    const lons = events.map((e) => e.longitude);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [30, 30], maxZoom: 12 },
    );
  }, [events, map]);
  return null;
}

export function HotspotMap() {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventType, setEventType] = useState("All");
  const [riskTier, setRiskTier] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getMapEvents(eventType, riskTier)
      .then((res) => setEvents(res.events))
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [eventType, riskTier]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Hotspot Map</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Out-of-fold predictions across Bengaluru — filter by event type and risk tier.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <FilterSelect
          label="Event Type"
          value={eventType}
          onChange={setEventType}
          options={["All", "planned", "unplanned"]}
        />
        <FilterSelect
          label="Risk Tier"
          value={riskTier}
          onChange={setRiskTier}
          options={["All", "Low", "Medium", "High", "Critical"]}
        />
        <p className="pb-2 text-sm text-cp-muted">
          <span className="font-mono font-semibold text-cp-navy">{events.length}</span> events plotted
        </p>
      </div>

      {error && <ErrorAlert message={error} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingSpinner label="Loading map data…" />
        ) : events.length === 0 ? (
          <EmptyState message="No events match the selected filters." />
        ) : (
          <MapContainer
            center={BENGALURU_CENTER}
            zoom={11}
            className="h-[560px] w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds events={events} />
            {events.map((ev, i) => (
              <CircleMarker
                key={`${ev.latitude}-${ev.longitude}-${i}`}
                center={[ev.latitude, ev.longitude]}
                radius={5}
                pathOptions={{
                  color: RISK_COLORS[ev.risk_tier] ?? "#1565C0",
                  fillColor: RISK_COLORS[ev.risk_tier] ?? "#1565C0",
                  fillOpacity: 0.75,
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <p><strong>{ev.event_cause}</strong></p>
                    <p>Corridor: {ev.corridor}</p>
                    <p>Station: {ev.police_station}</p>
                    <p className="font-mono">
                      Prob: {ev.closure_probability != null ? `${(ev.closure_probability * 100).toFixed(1)}%` : "N/A"}
                    </p>
                    <p className="font-mono">Impact: {ev.impact_index.toFixed(1)}</p>
                    <p className="text-gray-500">{ev.start_datetime}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-cp-muted">
        {Object.entries(RISK_COLORS).map(([tier, color]) => (
          <span key={tier} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {tier}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <select className="form-field mt-1 min-w-[160px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
