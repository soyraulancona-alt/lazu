import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { DailyChart } from "@/components/daily-chart";
import { KpiCard, KpiSkeleton } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { CHART_DAYS, getTeamOverview, IDLE_DAYS } from "@/lib/stats";
import { ctxCan } from "@/lib/tenant";

export const metadata: Metadata = { title: "Resumen" };

export default function OrgOverviewPage({ params }: PageProps<"/dashboard/[org]">) {
  return (
    <Suspense fallback={<KpiSkeleton count={6} />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await getTeamOverview(ctx);
  const { counts30 } = data;
  const isManager = ctxCan(ctx, "stats.team");
  const showRanking = isManager && ctx.access.features.teamStats;
  const base = `/dashboard/${ctx.org.slug}`;
  const idle = data.rows.filter((r) => r.idle);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {isManager ? "Actividad de tu equipo" : "Tu actividad"} en los últimos {CHART_DAYS} días.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Tarjetas escaneadas" value={counts30.card_scan} />
        <KpiCard label="Visitas al perfil" value={counts30.page_view} />
        <KpiCard label="Conversaciones WhatsApp" value={counts30.whatsapp_click} hint="clics en el botón" accent />
        <KpiCard label="Contactos guardados" value={counts30.contact_save} hint="descargas de vCard" />
        <KpiCard label="Contactos recibidos" value={data.leads30} hint="formulario con consentimiento" accent />
        {isManager ? (
          <KpiCard
            label="Perfiles activos"
            value={data.activeSeats}
            hint={`de ${ctx.org.seatLimit} incluidos en el plan`}
          />
        ) : null}
      </div>

      {isManager && idle.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {idle.length === 1 ? "1 perfil activo no ha tenido" : `${idle.length} perfiles activos no han tenido`} actividad
          en {IDLE_DAYS} días: {idle.map((r) => r.memberName ?? r.name).join(", ")}. Vale la pena preguntar si están
          usando su tarjeta.
        </p>
      ) : null}

      <Card title={`Últimos ${CHART_DAYS} días`} description="Visitas frente al resto de interacciones (WhatsApp, llamadas, contactos…).">
        <DailyChart data={data.daily} />
      </Card>

      <Card
        title={showRanking ? "Ranking del equipo" : "Perfiles"}
        description={
          showRanking
            ? "Ordenado por conversaciones generadas (WhatsApp + contactos recibidos)."
            : isManager
              ? "El ranking por colaborador está incluido en los planes Equipo y Empresa vigentes."
              : undefined
        }
      >
        {data.rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isManager ? (
              <>
                Todavía no hay perfiles.{" "}
                {ctxCan(ctx, "profiles.manage") ? (
                  <Link href={`${base}/team`} className="font-medium text-navy underline">
                    Crea el primero en Equipo
                  </Link>
                ) : null}
              </>
            ) : (
              "Aún no tienes un perfil asignado. Pide a tu administrador que te asigne uno."
            )}
          </p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Perfil</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  {showRanking || !isManager ? (
                    <>
                      <th className="px-5 py-3 text-right font-medium">Escaneos</th>
                      <th className="px-5 py-3 text-right font-medium">Visitas</th>
                      <th className="px-5 py-3 text-right font-medium">WhatsApp</th>
                      <th className="px-5 py-3 text-right font-medium">Guardados</th>
                      <th className="px-5 py-3 text-right font-medium">Contactos</th>
                    </>
                  ) : null}
                  <th className="px-5 py-3 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`${base}/profiles/${p.slug}`} className="font-medium text-navy hover:text-orange-600">
                        {p.memberName ?? p.name}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{p.slug}</div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={p.status} />
                      {p.idle ? <span className="ml-2 text-xs text-amber-700">sin uso</span> : null}
                    </td>
                    {showRanking || !isManager ? (
                      <>
                        <td className="px-5 py-3 text-right">{p.scans.toLocaleString("es")}</td>
                        <td className="px-5 py-3 text-right">{p.visits.toLocaleString("es")}</td>
                        <td className="px-5 py-3 text-right font-semibold text-orange-600">{p.whatsapp.toLocaleString("es")}</td>
                        <td className="px-5 py-3 text-right">{p.contactSaves.toLocaleString("es")}</td>
                        <td className="px-5 py-3 text-right font-semibold text-orange-600">{p.leads.toLocaleString("es")}</td>
                      </>
                    ) : null}
                    <td className="px-5 py-3 text-slate-600">{formatDateTime(p.lastEventAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        &quot;Conversaciones WhatsApp&quot; cuenta los clics en el botón de WhatsApp del perfil: mide la intención de escribir,
        no los mensajes enviados.
      </p>
    </div>
  );
}
