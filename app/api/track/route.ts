import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { config } from "@/lib/config";
import { corsHeaders, isOriginAllowed } from "@/lib/cors";
import { prisma } from "@/lib/db";
import { findActiveProfileId } from "@/lib/profiles";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { sanitizeReferrer } from "@/lib/referrer";
import { MAX_BODY_BYTES, parseTrackPayload } from "@/lib/track-validation";
import { detectDeviceType, isBot } from "@/lib/user-agent";

const limiter = createRateLimiter({
  limit: config.trackRateLimitPerMinute,
  windowMs: 60_000,
});

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Los navegadores siempre envían Origin en peticiones cross-origin.
 * Si el origen no está permitido se rechaza en el servidor (no solo por CORS),
 * porque sendBeacon y fetch con text/plain no hacen preflight.
 */
function resolveOrigin(request: NextRequest): { allowed: boolean; headers: Record<string, string> } {
  const origin = request.headers.get("origin");
  if (isOriginAllowed(origin, config.allowedOrigins, !config.isProduction)) {
    return { allowed: true, headers: corsHeaders(origin!) };
  }
  return { allowed: false, headers: { Vary: "Origin" } };
}

export async function OPTIONS(request: NextRequest) {
  const { allowed, headers } = resolveOrigin(request);
  return new NextResponse(null, { status: allowed ? 204 : 403, headers });
}

export async function POST(request: NextRequest) {
  const { allowed, headers: cors } = resolveOrigin(request);
  if (!allowed) return json({ success: false, error: "origin_not_allowed" }, 403, cors);

  const rate = limiter.check(clientIp(request.headers));
  if (!rate.allowed) {
    return json({ success: false, error: "rate_limited" }, 429, {
      ...cors,
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ success: false, error: "payload_too_large" }, 413, cors);
  }

  const parsed = parseTrackPayload(await request.text());
  if (!parsed.ok) {
    const status = parsed.error === "payload_too_large" ? 413 : 400;
    return json({ success: false, error: parsed.error }, status, cors);
  }
  const { profile, event, sessionId, referrer, metadata } = parsed.data;

  const profileId = await findActiveProfileId(profile);
  // Mismo error para "no existe" y "no está activo": no revelamos el estado del perfil.
  if (!profileId) return json({ success: false, error: "invalid_profile" }, 400, cors);

  const userAgent = request.headers.get("user-agent");
  // Bots y vistas previas de enlaces no cuentan; respondemos éxito sin guardar.
  if (isBot(userAgent)) return json({ success: true }, 200, cors);

  await prisma.event.create({
    data: {
      profileId,
      eventType: event,
      referrer: sanitizeReferrer(referrer),
      userAgent: userAgent?.slice(0, 400) ?? null,
      deviceType: detectDeviceType(userAgent),
      anonymousSessionId: sessionId ?? null,
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : Prisma.DbNull,
    },
  });

  return json({ success: true }, 200, cors);
}
