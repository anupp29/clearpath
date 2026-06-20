import type {
  DispatchRow,
  InsightsData,
  LivePredictionMarker,
  MapEvent,
  MetaOptions,
  PredictRequest,
  PredictResponse,
  SampleEvents,
} from "../types";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(String(detail), res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getOptions: () => request<MetaOptions>("/api/meta/options"),

  predict: (body: PredictRequest) =>
    request<PredictResponse>("/api/predict", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMapEvents: (eventType: string, riskTier: string) =>
    request<{ events: MapEvent[]; total: number; live_total?: number; historical_total?: number }>(
      `/api/map/events?event_type=${encodeURIComponent(eventType)}&risk_tier=${encodeURIComponent(riskTier)}&limit=10000`,
    ),

  getDispatch: () =>
    request<{ rows: DispatchRow[]; total: number }>("/api/dispatch"),

  getInsights: () => request<InsightsData>("/api/insights"),

  getSampleEvents: () => request<SampleEvents>("/api/sample-events"),

  getReadme: () => request<{ content: string; source: string }>("/api/docs/readme"),

  getLiveEvents: () =>
    request<{ events: LivePredictionMarker[]; total: number }>("/api/live/events"),

  getHealth: () =>
    request<{
      status: string;
      model_warm: boolean;
      warmup_ms: number;
      live_events: number;
      session_predictions: number;
    }>("/api/health"),
};

export { ApiError };
