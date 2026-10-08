/**
 * Rate limiting en memoria con ventana fija.
 * Suficiente para el MVP en una sola instancia. En un despliegue con varias
 * instancias (Vercel) cada instancia lleva su propio conteo; para un límite
 * global se puede cambiar por Redis/Upstash sin tocar las rutas.
 */
export type RateLimiter = {
  check(key: string, now?: number): { allowed: boolean; retryAfterSeconds: number };
};

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 50_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function sweep(now: number) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return {
    check(key, now = Date.now()) {
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) sweep(now);
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return {
        allowed: entry.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    },
  };
}

/** IP del cliente, usada solo en memoria para limitar peticiones. Nunca se guarda. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
