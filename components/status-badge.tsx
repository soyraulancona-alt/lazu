const STYLES: Record<string, { label: string; className: string; dot: string }> = {
  ACTIVE: { label: "Activo", className: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  INACTIVE: { label: "Inactivo", className: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  SUSPENDED: { label: "Suspendido", className: "bg-red-50 text-red-800", dot: "bg-red-600" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.INACTIVE!;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}
