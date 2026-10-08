export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|preview|headlesschrome|lighthouse|pingdom|monitor/i;
const TABLET_RE = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i;
const MOBILE_RE = /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i;

/** Bots y generadores de vista previa (p. ej. al compartir un enlace por WhatsApp) no cuentan como visitas. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_RE.test(userAgent);
}

export function detectDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "unknown";
  if (TABLET_RE.test(userAgent)) return "tablet";
  if (MOBILE_RE.test(userAgent)) return "mobile";
  return "desktop";
}
