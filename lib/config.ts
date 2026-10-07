import "server-only";
import { parseAllowedOrigins } from "./cors";

const isProduction = process.env.NODE_ENV === "production";

function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  isProduction,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  trackRateLimitPerMinute: intFromEnv("TRACK_RATE_LIMIT_PER_MINUTE", 60),
  dashboardTimeZone: process.env.DASHBOARD_TIMEZONE || "UTC",
};

export function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET debe existir y tener al menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}
