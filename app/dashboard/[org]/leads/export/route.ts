import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/guards";
import { leadWhere } from "@/lib/tenant";

/** Descarga de contactos (CSV). Mismo control que la página: sesión, empresa, permiso y plan. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/dashboard/[org]/leads/export">) {
  const { org } = await ctx.params;
  const orgCtx = await requireOrg(org, "leads.export");
  if (!orgCtx.access.features.leadsExport) {
    return new NextResponse("La exportación requiere un plan Equipo o Empresa vigente.", { status: 403 });
  }

  const leads = await prisma.lead.findMany({
    where: leadWhere(orgCtx),
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      name: true,
      phone: true,
      email: true,
      company: true,
      message: true,
      status: true,
      consentAt: true,
      consentVersion: true,
      profile: { select: { slug: true, member: { select: { name: true } } } },
    },
  });
  await audit(orgCtx, "leads.export", { type: "lead" }, { count: leads.length });

  const csv = toCsv(
    ["fecha", "nombre", "telefono", "correo", "empresa", "mensaje", "seguimiento", "perfil", "colaborador", "consentimiento", "version_aviso"],
    leads.map((l) => [
      l.createdAt,
      l.name,
      l.phone,
      l.email,
      l.company,
      l.message,
      l.status,
      l.profile?.slug,
      l.profile?.member?.name,
      l.consentAt,
      l.consentVersion,
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos-${orgCtx.org.slug}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
