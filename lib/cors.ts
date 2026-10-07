/**
 * CORS para /api/track.
 *
 * ALLOWED_ORIGINS es una lista separada por comas. Admite comodín de subdominio:
 *   ALLOWED_ORIGINS="https://lazu.bio,https://*.lazu.bio,https://barberialux.com"
 * En desarrollo (NODE_ENV !== "production") también se acepta cualquier
 * http://localhost:<puerto> y http://127.0.0.1:<puerto>.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

const LOCAL_DEV_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isOriginAllowed(
  origin: string | null,
  allowed: string[],
  isDev: boolean,
): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();
  if (isDev && LOCAL_DEV_RE.test(o)) return true;
  for (const entry of allowed) {
    if (entry === o) return true;
    // "https://*.lazu.bio" acepta "https://juan.lazu.bio" pero no "https://lazu.bio.evil.com"
    const wildcard = entry.match(/^(https?):\/\/\*\.(.+)$/);
    if (wildcard) {
      const [, scheme, domain] = wildcard;
      const prefix = `${scheme}://`;
      if (o.startsWith(prefix) && o.endsWith(`.${domain}`)) {
        const sub = o.slice(prefix.length, o.length - domain.length - 1);
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(sub)) return true;
      }
    }
  }
  return false;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
