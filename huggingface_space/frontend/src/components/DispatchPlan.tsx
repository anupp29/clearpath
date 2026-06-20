import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { DispatchRow } from "../types";
import { Card } from "./ui/Card";
import { TierBadge } from "./ui/Badge";
import { ErrorAlert, EmptyState } from "./ui/ErrorAlert";
import { LoadingSpinner } from "./ui/LoadingSpinner";

const TIER_COLORS: Record<number, string> = {
  3: "#EF6C00",
  4: "#C62828",
};

type SortKey = keyof DispatchRow;

export function DispatchPlan() {
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("impact_index");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterTier, setFilterTier] = useState<"all" | "3" | "4">("all");
  const [filterType, setFilterType] = useState("All");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getDispatch()
      .then((res) => setRows(res.rows))
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (filterTier !== "all") {
      data = data.filter((r) => r.tier.includes(`TIER ${filterTier}`));
    }
    if (filterType !== "All") {
      data = data.filter((r) => r.type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (r) =>
          r.cause.toLowerCase().includes(q) ||
          r.corridor.toLowerCase().includes(q) ||
          r.station.toLowerCase().includes(q),
      );
    }
    data.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return data;
  }, [rows, sortKey, sortAsc, filterTier, filterType, search]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const tierNum = (tier: string) => {
    const m = tier.match(/TIER (\d)/);
    return m ? parseInt(m[1], 10) : 3;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-cp-navy">Dispatch Plan</h2>
        <p className="mt-1 text-sm text-cp-muted">
          Tier 3+ events ranked by impact index — the list a shift commander would act on.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="section-label">Search</span>
          <input
            type="text"
            className="form-field mt-1 min-w-[200px]"
            placeholder="Cause, corridor, station…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <FilterSelect label="Tier" value={filterTier} onChange={(v) => setFilterTier(v as typeof filterTier)} options={[
          { v: "all", l: "All Tier 3+" },
          { v: "3", l: "Tier 3 only" },
          { v: "4", l: "Tier 4 only" },
        ]} />
        <FilterSelect label="Type" value={filterType} onChange={setFilterType} options={[
          { v: "All", l: "All types" },
          { v: "planned", l: "Planned" },
          { v: "unplanned", l: "Unplanned" },
        ]} />
        <p className="pb-2 text-sm text-cp-muted">
          <span className="font-mono font-semibold text-cp-navy">{filtered.length}</span> events
        </p>
      </div>

      {error && <ErrorAlert message={error} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingSpinner label="Loading dispatch plan…" />
        ) : filtered.length === 0 ? (
          <EmptyState message="No dispatch events match your filters." />
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-cp-bg text-xs uppercase tracking-wide text-cp-muted">
                <tr>
                  <Th sortKey="datetime" current={sortKey} asc={sortAsc} onSort={toggleSort}>Datetime</Th>
                  <Th sortKey="cause" current={sortKey} asc={sortAsc} onSort={toggleSort}>Cause</Th>
                  <Th sortKey="corridor" current={sortKey} asc={sortAsc} onSort={toggleSort}>Corridor</Th>
                  <Th sortKey="station" current={sortKey} asc={sortAsc} onSort={toggleSort}>Station</Th>
                  <Th sortKey="type" current={sortKey} asc={sortAsc} onSort={toggleSort}>Type</Th>
                  <Th sortKey="priority" current={sortKey} asc={sortAsc} onSort={toggleSort}>Priority</Th>
                  <Th sortKey="closure_prob" current={sortKey} asc={sortAsc} onSort={toggleSort}>Prob</Th>
                  <Th sortKey="exp_duration_min" current={sortKey} asc={sortAsc} onSort={toggleSort}>Duration</Th>
                  <Th sortKey="impact_index" current={sortKey} asc={sortAsc} onSort={toggleSort}>Impact</Th>
                  <th className="px-3 py-2.5">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cp-border">
                {filtered.slice(0, 200).map((row, i) => {
                  const tn = tierNum(row.tier);
                  return (
                    <tr key={i} className="hover:bg-cp-bg/60">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.datetime}</td>
                      <td className="px-3 py-2">{row.cause}</td>
                      <td className="px-3 py-2">{row.corridor}</td>
                      <td className="px-3 py-2">{row.station}</td>
                      <td className="px-3 py-2 capitalize">{row.type}</td>
                      <td className="px-3 py-2">{row.priority}</td>
                      <td className="px-3 py-2 font-mono">{(row.closure_prob * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 font-mono">{row.exp_duration_min.toFixed(0)} min</td>
                      <td className="px-3 py-2 font-mono font-semibold">{row.impact_index.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <TierBadge label={`T${tn}`} color={TIER_COLORS[tn] ?? "#EF6C00"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({
  children,
  sortKey,
  current,
  asc,
  onSort,
}: {
  children: ReactNode;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="cursor-pointer px-3 py-2.5 hover:text-cp-navy"
      onClick={() => onSort(sortKey)}
    >
      {children}
      {active && <span className="ml-1">{asc ? "↑" : "↓"}</span>}
    </th>
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
  options: { v: string; l: string }[];
}) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <select className="form-field mt-1 min-w-[140px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </label>
  );
}
