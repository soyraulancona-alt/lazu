import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { DailyChart } from "@/components/daily-chart";
import { KpiCard, KpiSkeleton } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getOverview } from "@/lib/stats";
import { CreateProfileForm } from "./create-profile-form";

export const metadata: Metadata = { title: "Resumen" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Resumen</h1>
        <p className="text-sm text-slate-500">Actividad acumulada de tus perfiles LAZU.</p>
      </div>
      <Suspense fallback={<KpiSkeleton count={8} />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const user = await requireUser();
  const data = await getOverview(user);
  const { counts } = data;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Perfiles activos" value={data.activeProfiles} hint={`de ${data.profiles.length} en total`} />
        <KpiCard label="Visitas totales" value={counts.page_view} />
        <KpiCard label="Eventos totales" value={data.totalEvents} />
        <KpiCard label="WhatsApp" value={counts.whatsapp_click} accent />
        <KpiCard label="Teléfono" value={counts.phone_click} />
        <KpiCard label="Maps" value={counts.maps_click} />
        <KpiCard label="Sitio web" value={counts.website_click} />
        <KpiCard label="Contactos guardados" value={counts.contact_save} />
      </div>

      <Card title="Últimos 30 días" description="Visitas e interacciones de todos tus perfiles por día.">
        <DailyChart data={data.daily} />
      </Card>

      <Card title="Perfiles">
        {data.profiles.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay perfiles.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Perfil</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Visitas</th>
                  <th className="px-5 py-3 text-right font-medium">Interacciones</th>
                  <th className="px-5 py-3 font-medium">Último evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/profiles/${p.slug}`} className="font-medium text-navy hover:text-orange-600">
                        {p.name}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{p.slug}</div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.visits.toLocaleString("es")}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.interactions.toLocaleString("es")}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDateTime(p.lastEventAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {user.role === "ADMIN" ? (
        <Card
          title="Nuevo perfil"
          description="Registra el slug que usará el HTML independiente en LAZU_PROFILE_ID."
        >
          <CreateProfileForm />
        </Card>
      ) : null}
    </>
  );
}
