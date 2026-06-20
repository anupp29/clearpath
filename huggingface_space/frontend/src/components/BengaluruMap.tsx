import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LivePredictionMarker, MapEvent } from "../types";

const RISK_COLORS: Record<string, string> = {
  Low: "#2E7D32",
  Medium: "#F9A825",
  High: "#EF6C00",
  Critical: "#C62828",
};

export const BENGALURU_CENTER: [number, number] = [12.9716, 77.5946];

const pickIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1565C0;border:3px solid #fff;box-shadow:0 0 0 2px #1565C0"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function MapFlyTo({ lat, lon, zoom }: { lat: number; lon: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], zoom ?? map.getZoom(), { duration: 0.8 });
  }, [lat, lon, zoom, map]);
  return null;
}

function MapClickPicker({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface BengaluruMapProps {
  historicalEvents?: MapEvent[];
  liveMarkers?: LivePredictionMarker[];
  selectedCoords?: { latitude: number; longitude: number } | null;
  pickMode?: boolean;
  onPick?: (lat: number, lon: number) => void;
  focusCoords?: { latitude: number; longitude: number } | null;
  height?: string;
  emptyMessage?: string;
}

export function BengaluruMap({
  historicalEvents = [],
  liveMarkers = [],
  selectedCoords,
  pickMode = false,
  onPick,
  focusCoords,
  height = "420px",
  emptyMessage,
}: BengaluruMapProps) {
  const hasData = historicalEvents.length > 0 || liveMarkers.length > 0 || selectedCoords;

  return (
    <div className="relative">
      {pickMode && (
        <div className="absolute left-3 top-3 z-[1000] rounded-md bg-cp-navy/90 px-3 py-1.5 text-xs font-medium text-white shadow">
          Click map to set coordinates
        </div>
      )}
      {liveMarkers.length > 0 && (
        <div className="absolute right-3 top-3 z-[1000] rounded-md bg-white/95 px-3 py-1.5 text-xs text-cp-navy shadow border border-cp-border">
          <span className="font-mono font-semibold">{liveMarkers.length}</span> live prediction{liveMarkers.length !== 1 ? "s" : ""}
        </div>
      )}
      <MapContainer
        center={BENGALURU_CENTER}
        zoom={11}
        className="w-full rounded-lg"
        style={{ height }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onPick && <MapClickPicker enabled={pickMode} onPick={onPick} />}
        {focusCoords && (
          <MapFlyTo lat={focusCoords.latitude} lon={focusCoords.longitude} zoom={14} />
        )}
        {selectedCoords && (
          <Marker
            position={[selectedCoords.latitude, selectedCoords.longitude]}
            icon={pickIcon}
          />
        )}
        {historicalEvents.map((ev, i) => (
          <CircleMarker
            key={`hist-${ev.latitude}-${ev.longitude}-${i}`}
            center={[ev.latitude, ev.longitude]}
            radius={4}
            pathOptions={{
              color: RISK_COLORS[ev.risk_tier] ?? "#1565C0",
              fillColor: RISK_COLORS[ev.risk_tier] ?? "#1565C0",
              fillOpacity: 0.6,
              weight: 1,
            }}
          >
            <Popup>
              <MapPopupContent
                cause={ev.event_cause}
                corridor={ev.corridor}
                station={ev.police_station}
                prob={ev.closure_probability}
                impact={ev.impact_index}
                label="Historical (OOF)"
              />
            </Popup>
          </CircleMarker>
        ))}
        {liveMarkers.map((ev) => (
          <CircleMarker
            key={ev.id}
            center={[ev.latitude, ev.longitude]}
            radius={9}
            pathOptions={{
              color: "#FFFFFF",
              fillColor: ev.tier_color,
              fillOpacity: 0.95,
              weight: 3,
            }}
          >
            <Popup>
              <MapPopupContent
                cause={ev.event_cause}
                corridor={ev.corridor}
                station={ev.police_station}
                prob={ev.closure_probability}
                impact={ev.impact_index}
                tier={ev.recommended_tier}
                label="Live prediction"
              />
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {!hasData && emptyMessage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 text-sm text-cp-muted">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function MapPopupContent({
  cause,
  corridor,
  station,
  prob,
  impact,
  tier,
  label,
}: {
  cause: string;
  corridor: string;
  station: string;
  prob: number | null;
  impact: number;
  tier?: string;
  label: string;
}) {
  return (
    <div className="space-y-1 text-xs min-w-[140px]">
      <p className="text-[10px] uppercase tracking-wide text-cp-muted">{label}</p>
      <p><strong>{cause}</strong></p>
      <p>Corridor: {corridor}</p>
      <p>Station: {station}</p>
      {tier && <p className="font-medium text-cp-navy">{tier}</p>}
      <p className="font-mono">
        Prob: {prob != null ? `${(prob * 100).toFixed(1)}%` : "N/A"}
      </p>
      <p className="font-mono">Impact: {impact.toFixed(1)}</p>
    </div>
  );
}

export function MapLegend({ showLive = false }: { showLive?: boolean }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-cp-muted">
      {Object.entries(RISK_COLORS).map(([tier, color]) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {tier} (historical)
        </span>
      ))}
      {showLive && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-cp-blue shadow" style={{ boxShadow: "0 0 0 1px #1565C0" }} />
          Live prediction
        </span>
      )}
    </div>
  );
}
