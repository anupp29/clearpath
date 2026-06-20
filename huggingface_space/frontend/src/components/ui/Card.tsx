import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  accent?: string;
}

export function Card({ children, className = "", accent }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-cp-border bg-cp-card p-4 shadow-sm ${className}`}
      style={accent ? { borderLeftWidth: 4, borderLeftColor: accent } : undefined}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  mono?: boolean;
}

export function MetricCard({ label, value, sub, mono }: MetricCardProps) {
  return (
    <Card>
      <p className="section-label">{label}</p>
      <p className={`mt-1 text-3xl font-bold text-cp-navy ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
        {sub && <span className="ml-1 text-sm font-normal text-cp-muted">{sub}</span>}
      </p>
    </Card>
  );
}
