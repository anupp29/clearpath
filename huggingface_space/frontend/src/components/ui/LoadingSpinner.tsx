export function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-cp-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cp-border border-t-cp-blue" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
