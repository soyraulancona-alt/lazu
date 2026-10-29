import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { Card } from "@/components/card";
import { KpiSkeleton } from "@/components/kpi-card";
import { cardUrls } from "@/lib/card-code";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { getCardScans30 } from "@/lib/stats";
import { assignCard, createCards } from "../actions";

export const metadata: Metadata = { title: "Tarjetas" };

const MAX_LISTED = 500;

export default function CardsPage({ params }: PageProps<"/dashboard/[org]/cards">) {
  return (
    <Suspense fallback={<KpiSkeleton count={4} />}>
      <Cards params={params} />
    </Suspense>
  );
}

async function Cards({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "cards.manage");
  const [cards, profiles, scans] = await Promise.all([
    prisma.card.findMany({
      where: { organizationId: ctx.org.id },
      // Las tarjetas de un mismo lote comparten createdAt: el código desempata para un orden estable.
      orderBy: [{ createdAt: "asc" }, { code: "asc" }],
      take: MAX_LISTED,
      select: { id: true, code: true, label: true, status: true, profileId: true, assignedAt: true },
    }),
    prisma.profile.findMany({
      where: { organizationId: ctx.org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, status: true, member: { select: { name: true } } },
    }),
    getCardScans30(ctx),
  ]);
  const enabled = ctx.access.features.cards;

  return (
    <div className="space-y-6">
      <Card
        title="Tarjetas físicas"
        description="Cada tarjeta graba un enlace corto de LAZU, no el perfil. Para reasignarla cuando alguien entra o sale, cambia el perfil aquí: no hay que reimprimir."
      >
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay tarjetas. Genera los códigos abajo y envíalos a imprenta.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Tarjeta</th>
                  <th className="px-5 py-3 font-medium">Grabar en NFC / QR</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right font-medium">Escaneos 30 días</th>
                  <th className="px-5 py-3 font-medium">Asignación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((card) => {
                  const urls = cardUrls(config.cardBaseUrl, card.code);
                  return (
                    <tr key={card.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-mono font-medium text-navy">{card.code}</p>
                        <p className="text-xs text-slate-500">{card.label ?? "Sin etiqueta"}</p>
                        {card.assignedAt ? <p className="text-xs text-slate-400">Asignada {formatDate(card.assignedAt)}</p> : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-600">
                        <p className="select-all">{urls.nfc}</p>
                        <p className="select-all">{urls.qr}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{(scans.get(card.id) ?? 0).toLocaleString("es")}</td>
                      <td className="px-5 py-3">
                        <ActionForm action={assignCard} keepValues submitLabel="Guardar" variant="secondary" className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="org" value={ctx.org.slug} />
                          <input type="hidden" name="id" value={card.id} />
                          <select name="profileId" defaultValue={card.profileId ?? ""} aria-label="Perfil" className="max-w-56 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                            <option value="">Sin asignar</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.member?.name ?? p.name} ({p.slug}){p.status !== "ACTIVE" ? " · pausado" : ""}
                              </option>
                            ))}
                          </select>
                          <select name="status" defaultValue={card.status} aria-label="Estado" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                            <option value="ACTIVE">Activa</option>
                            <option value="INACTIVE">Desactivada</option>
                          </select>
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {cards.length === MAX_LISTED ? <p className="mt-3 text-xs text-slate-500">Se muestran las primeras {MAX_LISTED} tarjetas.</p> : null}
      </Card>

      <Card
        title="Generar tarjetas"
        description="Crea códigos nuevos sin asignar. Una tarjeta desactivada o sin asignar lleva a la página de respaldo de la empresa (configúrala en Plan)."
      >
        {enabled ? (
          <ActionForm action={createCards} submitLabel="Generar" pendingLabel="Generando…" className="space-y-4">
            <input type="hidden" name="org" value={ctx.org.slug} />
            <div className="grid gap-3 md:grid-cols-3">
              <label className={labelClass}>
                Cantidad
                <input name="count" type="number" min={1} max={200} defaultValue={5} required className={inputClass} />
              </label>
              <label className={labelClass}>
                Etiqueta <span className="font-normal text-slate-400">(opcional)</span>
                <input name="label" placeholder="Lote octubre" className={inputClass} />
              </label>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-amber-800">Las tarjetas requieren un plan vigente.</p>
        )}
      </Card>
    </div>
  );
}
