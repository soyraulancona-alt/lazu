import { after, NextResponse, type NextRequest } from "next/server";
import { resolveCardTarget } from "@/lib/cards";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { detectDeviceType, isBot } from "@/lib/user-agent";

// Escanear la misma tarjeta muchas veces seguidas no infla las métricas sin límite.
const scanLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

const NOT_ACTIVE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Tarjeta no activa · LAZU</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#023047;color:#fff;font:16px system-ui,sans-serif;text-align:center;padding:24px}
b{color:#fb8500}</style></head><body><main><p style="font-size:28px;font-weight:800;margin:0 0 8px">LAZU<b>.</b></p>
<p>Esta tarjeta todavía no está activa.</p></main></body></html>`;

/**
 * Enlace corto que llevan las tarjetas físicas: /c/<código> (NFC) y /c/<código>?v=qr (QR).
 * Registra el escaneo y redirige al perfil asignado en ese momento.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/c/[code]">) {
  const { code } = await ctx.params;
  const target = await resolveCardTarget(code.toLowerCase());

  if (target.kind === "none") {
    return new NextResponse(NOT_ACTIVE_HTML, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (target.kind === "profile") {
    const userAgent = request.headers.get("user-agent");
    const via = request.nextUrl.searchParams.get("v") === "qr" ? "qr" : "nfc";
    const counted = !isBot(userAgent) && scanLimiter.check(`${clientIp(request.headers)}:${code}`).allowed;
    if (counted) {
      // Se guarda después de responder: la redirección no espera a la base de datos.
      after(() =>
        prisma.event.create({
          data: {
            organizationId: target.organizationId,
            profileId: target.profileId,
            cardId: target.cardId,
            eventType: "card_scan",
            userAgent: userAgent?.slice(0, 400) ?? null,
            deviceType: detectDeviceType(userAgent),
            metadata: { via },
          },
        }),
      );
    }
  }

  return NextResponse.redirect(target.url, {
    status: 302,
    // Nunca en caché: la tarjeta puede reasignarse en cualquier momento.
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
