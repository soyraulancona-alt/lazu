/**
 * Conserva solo origen + ruta del referrer. Quita query string y fragmento,
 * que pueden contener datos personales o tokens de campañas.
 */
export function sanitizeReferrer(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}
