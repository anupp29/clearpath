import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAppContext } from "../context/AppContext";
import type { MapEvent } from "../types";
import { BengaluruMap, MapLegend } from "./BengaluruMap";
import { Card } from "./ui/Card";
import { ErrorAlert } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

export function HotspotMap() {
  const { livePredictions } = useAppContext();
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventType, setEventType] = useState("All");
  const [riskTier, setRiskTier] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [liveTotal, setLiveTotal] = useState(0);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getMapEvents(eventType, riskTier)
      .then((res) => {
        setEvents(res.events);
        setLiveTotal(res.live_total ?? 0);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [eventType, riskTier]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Hotspot Map</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Historical OOF predictions plus live session predictions from the prediction form.
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
          <span className="font-mono font-semibold text-cp-navy">{events.length}</span> events
          {liveTotal > 0 && (
            <>
              {" · "}
              <span className="font-mono font-semibold text-cp-blue">{liveTotal}</span> live-scored
            </>
          )}
        </p>
      </div>

      {error && <ErrorAlert message={error} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingSpinner label="Loading map data…" />
        ) : (
          <BengaluruMap
            historicalEvents={events.filter((e) => e.source !== "live")}
            liveMarkers={livePredictions}
            height="560px"
            emptyMessage={events.length === 0 ? "No events to display." : undefined}
          />
        )}
      </Card>

      <MapLegend showLive={livePredictions.length > 0} />
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
