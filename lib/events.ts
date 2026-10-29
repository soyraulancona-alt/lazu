// Tipos de evento aceptados por /api/track.
// Para agregar uno nuevo basta con añadirlo aquí (la columna es texto, no requiere migración).
export const EVENT_TYPES = [
  "page_view",
  "whatsapp_click",
  "phone_click",
  "maps_click",
  "social_click",
  "website_click",
  "contact_save",
  "catalog_view",
  "custom",
] as const;

export type ClientEventType = (typeof EVENT_TYPES)[number];

// Eventos que solo registra el servidor (el tracker no puede enviarlos).
export const SERVER_EVENT_TYPES = [
  "card_scan", // alguien abrió una tarjeta física (NFC o QR) en /c/<código>
  "lead_submit", // un visitante dejó sus datos en el formulario del perfil
] as const;

export const ALL_EVENT_TYPES = [...EVENT_TYPES, ...SERVER_EVENT_TYPES] as const;
export type EventType = (typeof ALL_EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(ALL_EVENT_TYPES);

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

export const EVENT_LABELS: Record<EventType, string> = {
  page_view: "Visitas",
  whatsapp_click: "WhatsApp",
  phone_click: "Teléfono",
  maps_click: "Maps",
  social_click: "Redes sociales",
  website_click: "Sitio web",
  contact_save: "Contacto guardado",
  catalog_view: "Catálogo",
  custom: "Personalizado",
  card_scan: "Tarjeta escaneada",
  lead_submit: "Contacto recibido",
};

export function eventLabel(type: string): string {
  return isEventType(type) ? EVENT_LABELS[type] : type;
}
