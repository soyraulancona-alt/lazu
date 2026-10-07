export function KpiCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${accent ? "text-orange-600" : "text-navy"}`}
      >
        {typeof value === "number" ? value.toLocaleString("es") : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function KpiSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-xl border border-slate-200 bg-white" />
      ))}
    </div>
  );
}
