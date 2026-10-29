import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "./config";
import { corsHeaders, isOriginAllowed } from "./cors";

/**
 * Los navegadores siempre envían Origin en peticiones cross-origin.
 * Si el origen no está permitido se rechaza en el servidor (no solo por CORS),
 * porque sendBeacon y fetch con text/plain no hacen preflight.
 */
export function resolveOrigin(request: NextRequest): { allowed: boolean; headers: Record<string, string> } {
  const origin = request.headers.get("origin");
  // Los HTML servidos por la propia app (p. ej. /test-profile.html) siempre pueden enviar eventos.
  const sameOrigin = origin === request.nextUrl.origin;
  if (sameOrigin || isOriginAllowed(origin, config.allowedOrigins, !config.isProduction)) {
    return { allowed: true, headers: corsHeaders(origin!) };
  }
  return { allowed: false, headers: { Vary: "Origin" } };
}

export function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
