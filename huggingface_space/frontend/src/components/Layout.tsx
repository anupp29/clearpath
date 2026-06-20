import type { ReactNode } from "react";
import type { Section } from "../types";

const NAV: { id: Section; label: string; desc: string }[] = [
  { id: "prediction", label: "Live Risk Prediction", desc: "Score new events" },
  { id: "map", label: "Hotspot Map", desc: "Bengaluru event map" },
  { id: "dispatch", label: "Dispatch Plan", desc: "Tier 3+ action list" },
  { id: "insights", label: "Model Insights", desc: "SHAP & CV metrics" },
  { id: "health", label: "System Health", desc: "Drift & quality" },
];

interface LayoutProps {
  section: Section;
  onSectionChange: (s: Section) => void;
  children: ReactNode;
}

export function Layout({ section, onSectionChange, children }: LayoutProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header
        className="border-b border-cp-border px-6 py-4 text-white"
        style={{ background: "linear-gradient(90deg, #0B2545 0%, #1565C0 100%)" }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              ClearPath AI &nbsp;|&nbsp; Event-Driven Road Closure Risk Engine
            </h1>
            <p className="mt-1 text-sm opacity-90">
              Bengaluru Traffic Police · ASTraM data partner · PS-2, Gridlock Hackathon 2.0
            </p>
          </div>
          <p className="font-mono text-xs opacity-75">
            {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-0 lg:gap-6">
        <nav className="hidden w-56 shrink-0 border-r border-cp-border bg-white/40 p-4 lg:block">
          <p className="section-label mb-3 px-3">Operations</p>
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={`nav-item ${section === item.id ? "nav-item-active" : "nav-item-inactive"}`}
                >
                  <span>
                    <span className="block">{item.label}</span>
                    <span className={`text-[10px] font-normal ${section === item.id ? "text-white/80" : "text-cp-muted"}`}>
                      {item.desc}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-cp-border bg-white/60 px-4 py-2 lg:hidden">
            <select
              className="form-field"
              value={section}
              onChange={(e) => onSectionChange(e.target.value as Section)}
            >
              {NAV.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
