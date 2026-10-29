import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_CONSENT_VERSION, parseLeadPayload } from "@/lib/lead-validation";
import { findActiveProfile } from "@/lib/profiles";
import { json, resolveOrigin } from "@/lib/public-api";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { MAX_BODY_BYTES } from "@/lib/track-validation";
import { detectDeviceType, isBot } from "@/lib/user-agent";

// Formulario público: límite estricto por IP (5 envíos cada 10 minutos).
const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

export async function OPTIONS(request: NextRequest) {
  const { allowed, headers } = resolveOrigin(request);
  return new NextResponse(null, { status: allowed ? 204 : 403, headers });
}

/**
 * Recibe los datos que un visitante deja en el perfil, con su consentimiento.
 * El contacto queda en la empresa dueña del perfil y solo lo ven ella y el
 * colaborador asignado.
 */
export async function POST(request: NextRequest) {
  const { allowed, headers: cors } = resolveOrigin(request);
  if (!allowed) return json({ success: false, error: "origin_not_allowed" }, 403, cors);

  const rate = limiter.check(`lead:${clientIp(request.headers)}`);
  if (!rate.allowed) {
    return json({ success: false, error: "rate_limited" }, 429, {
      ...cors,
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ success: false, error: "payload_too_large" }, 413, cors);
  }

  const parsed = parseLeadPayload(await request.text());
  if (!parsed.ok) {
    const status = parsed.error === "payload_too_large" ? 413 : 400;
    return json({ success: false, error: parsed.error }, status, cors);
  }
  const userAgent = request.headers.get("user-agent");
  // Campo trampa lleno o bot: respondemos éxito para no dar pistas, sin guardar nada.
  if (parsed.isSpam || isBot(userAgent)) return json({ success: true }, 200, cors);

  const { profile: slug, name, phone, email, company, message, consentVersion } = parsed.data;
  const profile = await findActiveProfile(slug);
  if (!profile) return json({ success: false, error: "invalid_profile" }, 400, cors);
  if (!profile.leadsEnabled) return json({ success: false, error: "leads_disabled" }, 403, cors);

  await prisma.$transaction([
    prisma.lead.create({
      data: {
        organizationId: profile.organizationId,
        profileId: profile.id,
        name,
        phone,
        email,
        company,
        message,
        consentAt: new Date(),
        consentVersion: consentVersion ?? DEFAULT_CONSENT_VERSION,
      },
    }),
    // El evento no lleva datos personales: solo cuenta que hubo un contacto.
    prisma.event.create({
      data: {
        organizationId: profile.organizationId,
        profileId: profile.id,
        eventType: "lead_submit",
        userAgent: userAgent?.slice(0, 400) ?? null,
        deviceType: detectDeviceType(userAgent),
      },
    }),
  ]);

  return json({ success: true }, 200, cors);
}
