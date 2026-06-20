interface BadgeProps {
  label: string;
  color: string;
}

export function TierBadge({ label, color }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

export function StatusDot({ status }: { status: "green" | "amber" | "red" }) {
  const colors = { green: "#2E7D32", amber: "#F9A825", red: "#C62828" };
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: colors[status] }}
      aria-hidden
    />
  );
}
