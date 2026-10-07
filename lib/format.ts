const dateTime = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: process.env.DASHBOARD_TIMEZONE || "UTC",
});

export function formatDateTime(value: Date | null | undefined): string {
  return value ? dateTime.format(value) : "—";
}

export const DEVICE_LABELS: Record<string, string> = {
  mobile: "Móvil",
  tablet: "Tablet",
  desktop: "Escritorio",
  unknown: "Desconocido",
};
