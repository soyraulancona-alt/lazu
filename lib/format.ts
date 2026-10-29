const timeZone = process.env.DASHBOARD_TIMEZONE || "UTC";
const dateTime = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone });
const dateOnly = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone });

export function formatDateTime(value: Date | null | undefined): string {
  return value ? dateTime.format(value) : "—";
}

export function formatDate(value: Date | null | undefined): string {
  return value ? dateOnly.format(value) : "—";
}

export const DEVICE_LABELS: Record<string, string> = {
  mobile: "Móvil",
  tablet: "Tablet",
  desktop: "Escritorio",
  unknown: "Desconocido",
};
