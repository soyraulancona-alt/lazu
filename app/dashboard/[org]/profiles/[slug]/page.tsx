import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { ProfileFields, type EditableProfile } from "@/components/profile-fields";
import { Card } from "@/components/card";
import { DailyChart } from "@/components/daily-chart";
import { KpiCard, KpiSkeleton } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { ALL_EVENT_TYPES, eventLabel } from "@/lib/events";
import { DEVICE_LABELS, formatDateTime } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { getProfileStats } from "@/lib/stats";
import { ctxCan, type OrgContext } from "@/lib/tenant";
import { updateProfile } from "../../actions";

export const metadata: Metadata = { title: "Perfil" };

export default function ProfilePage({ params }: PageProps<"/dashboard/[org]/profiles/[slug]">) {
  return (
    <Suspense fallback={<KpiSkeleton count={8} />}>
      <ProfileDetail params={params} />
    </Suspense>
  );
}

function formatMetadata(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

async function ProfileDetail({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const ctx = await requireOrg(org);
  const stats = await getProfileStats(ctx, slug);
  if (!stats) notFound();
  const { profile, counts, counts30 } = stats;
  const canManage = ctxCan(ctx, "profiles.manage");

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${ctx.org.slug}`} className="text-sm text-slate-500 hover:text-navy">
        ← Volver al resumen
      </Link>
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-navy">{profile.name}</h2>
          <StatusBadge status={profile.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          LAZU_PROFILE_ID <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-navy">{profile.slug}</code>
          {profile.member ? <> · Colaborador: {profile.member.name}</> : <> · Sin colaborador asignado</>}
          {profile.publicUrl ? (
            <>
              {" · "}
              <a href={profile.publicUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">
                Ver perfil publicado
              </a>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Tarjeta escaneada" value={counts30.card_scan} hint={`30 días · NFC ${stats.scans30.nfc} · QR ${stats.scans30.qr}`} />
        <KpiCard label="Visitas" value={counts30.page_view} hint={`${counts.page_view} en total`} />
        <KpiCard label="Visitantes aprox." value={stats.visitors30} hint={`30 días · ${stats.visitors} en total`} />
        <KpiCard label="WhatsApp" value={counts30.whatsapp_click} hint={`30 días · ${counts.whatsapp_click} en total`} accent />
        <KpiCard label="Contactos guardados" value={counts30.contact_save} hint={`30 días · ${counts.contact_save} en total`} />
        <KpiCard label="Contactos recibidos" value={stats.leads30} hint="30 días" accent />
        <KpiCard label="Teléfono" value={counts30.phone_click} hint={`30 días · ${counts.phone_click} en total`} />
        <KpiCard label="Tarjetas asignadas" value={profile.cards.filter((c) => c.status === "ACTIVE").length} hint={profile.cards.map((c) => c.code).join(", ") || "ninguna"} />
      </div>

      <Card title="Últimos 30 días" description="Visitas frente al resto de interacciones.">
        <DailyChart data={stats.daily} />
      </Card>

      {canManage ? <EditProfile ctx={ctx} profile={profile} /> : null}

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
                {ALL_EVENT_TYPES.map((type) => (
                  <tr key={type}>
                    <td className="px-5 py-2.5">
                      {eventLabel(type)} <span className="ml-1 font-mono text-xs text-slate-400">{type}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">{counts30[type].toLocaleString("es")}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{counts[type].toLocaleString("es")}</td>
                  </tr>
                ))}
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
            Aún no hay eventos. Abre el HTML del perfil con el tracker configurado o escanea una de sus tarjetas.
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
    </div>
  );
}


async function EditProfile({ ctx, profile }: { ctx: OrgContext; profile: EditableProfile }) {
  const members = await prisma.membership.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { user: { name: "asc" } },
    select: { user: { select: { id: true, name: true } } },
  });
  return (
    <Card title="Datos del perfil" description="Estos datos alimentan la generación del HTML y la redirección de las tarjetas.">
      <ActionForm action={updateProfile} keepValues submitLabel="Guardar cambios" className="space-y-4">
        <input type="hidden" name="org" value={ctx.org.slug} />
        <input type="hidden" name="id" value={profile.id} />
        <ProfileFields members={members.map((m) => m.user)} profile={profile} />
        <label className={`${labelClass} max-w-xs`}>
          Estado
          <select name="status" defaultValue={profile.status} className={inputClass}>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Pausado</option>
            {ctx.user.isPlatformAdmin || profile.status === "SUSPENDED" ? <option value="SUSPENDED">Suspendido</option> : null}
          </select>
        </label>
      </ActionForm>
    </Card>
  );
}
