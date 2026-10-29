import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/card";
import { KpiSkeleton } from "@/components/kpi-card";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { ctxCan, leadWhere } from "@/lib/tenant";
import { updateLeadStatus } from "../actions";

export const metadata: Metadata = { title: "Contactos" };

const PAGE_SIZE = 200;

const STATUS_LABELS = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  WON: "Ganado",
  LOST: "Perdido",
} as const;

export default function LeadsPage({ params }: PageProps<"/dashboard/[org]/leads">) {
  return (
    <Suspense fallback={<KpiSkeleton count={4} />}>
      <Leads params={params} />
    </Suspense>
  );
}

async function Leads({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  const where = leadWhere(ctx);

  if (!ctx.access.features.leads) {
    const pending = await prisma.lead.count({ where });
    return (
      <Card title="Contactos">
        <p className="text-sm text-amber-900">
          La bandeja de contactos requiere un plan vigente.
          {pending > 0 ? ` Hay ${pending.toLocaleString("es")} contactos guardados esperando: se muestran en cuanto renueves.` : ""}
        </p>
      </Card>
    );
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      company: true,
      message: true,
      status: true,
      createdAt: true,
      profile: { select: { name: true, member: { select: { name: true } } } },
    },
  });
  const canExport = ctxCan(ctx, "leads.export") && ctx.access.features.leadsExport;

  return (
    <Card
      title="Contactos recibidos"
      description="Personas que dejaron sus datos en un perfil y aceptaron el aviso de privacidad. Úsalos solo para dar seguimiento comercial."
    >
      {canExport ? (
        <a
          href={`/dashboard/${ctx.org.slug}/leads/export`}
          className="mb-4 inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50"
        >
          Descargar CSV
        </a>
      ) : null}
      {leads.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aún no hay contactos. Agrega al perfil HTML un formulario con <code className="font-mono">data-lazu-lead</code> (ver
          docs/LAZU_STANDALONE_TRACKER.md).
        </p>
      ) : (
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Mensaje</th>
                <th className="px-5 py-3 font-medium">Perfil</th>
                <th className="px-5 py-3 font-medium">Seguimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(lead.createdAt)}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-navy">{lead.name}</p>
                    {lead.company ? <p className="text-xs text-slate-500">{lead.company}</p> : null}
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="block text-xs text-navy underline">
                        {lead.phone}
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="block text-xs text-navy underline">
                        {lead.email}
                      </a>
                    ) : null}
                  </td>
                  <td className="max-w-64 px-5 py-3 text-slate-600">{lead.message ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{lead.profile?.member?.name ?? lead.profile?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <ActionForm action={updateLeadStatus} keepValues submitLabel="Guardar" variant="secondary" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="org" value={ctx.org.slug} />
                      <input type="hidden" name="id" value={lead.id} />
                      <select name="status" defaultValue={lead.status} aria-label="Seguimiento" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {leads.length === PAGE_SIZE ? <p className="mt-8 text-xs text-slate-500">Se muestran los {PAGE_SIZE} más recientes; descarga el CSV para verlos todos.</p> : null}
    </Card>
  );
}
