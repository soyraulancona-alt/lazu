import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/card";
import { DailyChart } from "@/components/daily-chart";
import { KpiCard, KpiSkeleton } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { EVENT_TYPES, eventLabel } from "@/lib/events";
import { DEVICE_LABELS, formatDateTime } from "@/lib/format";
import { getProfileStats } from "@/lib/stats";
import { setProfileStatus } from "../../actions";

export const metadata: Metadata = { title: "Perfil" };

export default function ProfilePage({ params }: PageProps<"/dashboard/profiles/[slug]">) {
  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-navy">
        ← Volver al resumen
      </Link>
      <Suspense fallback={<KpiSkeleton count={8} />}>
        <ProfileDetail params={params} />
      </Suspense>
    </div>
  );
}

function formatMetadata(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

async function ProfileDetail({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, user] = await Promise.all([params, requireUser()]);
  const stats = await getProfileStats(user, slug);
  if (!stats) notFound();
  const { profile, counts, counts30 } = stats;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-navy">{profile.name}</h1>
            <StatusBadge status={profile.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Slug <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-navy">{profile.slug}</code>
            {profile.owner ? <> · Dueño: {profile.owner.name}</> : null} · Creado {formatDateTime(profile.createdAt)}
          </p>
        </div>
        {user.role === "ADMIN" ? (
          <form action={setProfileStatus} className="flex items-center gap-2">
            <input type="hidden" name="slug" value={profile.slug} />
            <select
              name="status"
              defaultValue={profile.status}
              aria-label="Estado del perfil"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="SUSPENDED">Suspendido</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50"
            >
              Guardar estado
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Visitas" value={counts.page_view} hint={`${counts30.page_view} en 30 días`} />
        <KpiCard
          label="Visitantes aprox."
          value={stats.visitors}
          hint={`${stats.visitors30} en 30 días · ids anónimos distintos`}
        />
        <KpiCard label="WhatsApp" value={counts.whatsapp_click} hint={`${counts30.whatsapp_click} en 30 días`} accent />
        <KpiCard label="Teléfono" value={counts.phone_click} hint={`${counts30.phone_click} en 30 días`} />
        <KpiCard label="Maps" value={counts.maps_click} hint={`${counts30.maps_click} en 30 días`} />
        <KpiCard label="Sitio web" value={counts.website_click} hint={`${counts30.website_click} en 30 días`} />
        <KpiCard label="Redes sociales" value={counts.social_click} hint={`${counts30.social_click} en 30 días`} />
        <KpiCard label="Contactos guardados" value={counts.contact_save} hint={`${counts30.contact_save} en 30 días`} />
      </div>

      <Card title="Últimos 30 días" description="Visitas (page_view) frente al resto de interacciones.">
        <DailyChart data={stats.daily} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Resumen por evento" className="lg:col-span-2">
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Evento</th>
                  <th className="px-5 py-3 text-right font-medium">30 días</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {EVENT_TYPES.map((type) => (
                  <tr key={type}>
                    <td className="px-5 py-2.5">
                      {eventLabel(type)} <span className="ml-1 font-mono text-xs text-slate-400">{type}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">{counts30[type].toLocaleString("es")}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{counts[type].toLocaleString("es")}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-5 py-2.5 text-right">
                    {Object.values(counts30).reduce((a, b) => a + b, 0).toLocaleString("es")}
                  </td>
                  <td className="px-5 py-2.5 text-right">{stats.totalEvents.toLocaleString("es")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Dispositivos">
          {stats.devices.length === 0 ? (
            <p className="text-sm text-slate-500">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {stats.devices.map((d) => {
                const pct = stats.totalEvents ? Math.round((d.count / stats.totalEvents) * 100) : 0;
                return (
                  <li key={d.deviceType}>
                    <div className="flex justify-between">
                      <span>{DEVICE_LABELS[d.deviceType] ?? d.deviceType}</span>
                      <span className="tabular-nums text-slate-600">
                        {d.count.toLocaleString("es")} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-navy" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Eventos recientes" description="Los últimos 50 eventos recibidos.">
        {stats.recent.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay eventos. Abre el HTML del perfil con el tracker configurado para generar el primero.
          </p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Evento</th>
                  <th className="px-5 py-3 font-medium">Dispositivo</th>
                  <th className="px-5 py-3 font-medium">Origen</th>
                  <th className="px-5 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{formatDateTime(e.timestamp)}</td>
                    <td className="px-5 py-2.5 font-medium">{eventLabel(e.eventType)}</td>
                    <td className="px-5 py-2.5">{DEVICE_LABELS[e.deviceType] ?? e.deviceType}</td>
                    <td className="max-w-48 truncate px-5 py-2.5 text-slate-600" title={e.referrer ?? ""}>
                      {e.referrer ?? "Directo"}
                    </td>
                    <td className="max-w-64 truncate px-5 py-2.5 text-slate-600">{formatMetadata(e.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
