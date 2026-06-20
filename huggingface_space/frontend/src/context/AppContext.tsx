import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { LivePredictionMarker } from "../types";

interface AppContextValue {
  livePredictions: LivePredictionMarker[];
  refreshLiveEvents: () => Promise<void>;
  modelWarm: boolean;
  selectedCoords: { latitude: number; longitude: number } | null;
  setSelectedCoords: (coords: { latitude: number; longitude: number } | null) => void;
  mapFocus: { latitude: number; longitude: number } | null;
  setMapFocus: (coords: { latitude: number; longitude: number } | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [livePredictions, setLivePredictions] = useState<LivePredictionMarker[]>([]);
  const [modelWarm, setModelWarm] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number } | null>(null);

  const refreshLiveEvents = useCallback(async () => {
    try {
      const [live, health] = await Promise.all([api.getLiveEvents(), api.getHealth()]);
      setLivePredictions(
        live.events.map((e) => ({
          id: e.id,
          latitude: e.latitude,
          longitude: e.longitude,
          event_cause: e.event_cause,
          corridor: e.corridor,
          police_station: e.police_station,
          event_type: e.event_type,
          closure_probability: e.closure_probability,
          impact_index: e.impact_index,
          tier_level: e.tier_level,
          tier_color: e.tier_color,
          recommended_tier: e.recommended_tier,
          risk_tier: e.risk_tier,
          timestamp: e.scored_at,
        })),
      );
      setModelWarm(health.model_warm);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) return;
      console.error("Failed to refresh live events", e);
    }
  }, []);

  useEffect(() => {
    refreshLiveEvents();
    const interval = setInterval(refreshLiveEvents, 15000);
    return () => clearInterval(interval);
  }, [refreshLiveEvents]);

  const value = useMemo(
    () => ({
      livePredictions,
      refreshLiveEvents,
      modelWarm,
      selectedCoords,
      setSelectedCoords,
      mapFocus,
      setMapFocus,
    }),
    [livePredictions, refreshLiveEvents, modelWarm, selectedCoords, mapFocus],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
