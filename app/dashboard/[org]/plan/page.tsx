import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { Card } from "@/components/card";
import { KpiCard, KpiSkeleton } from "@/components/kpi-card";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { PLAN_FEATURES, PLAN_LABELS, type PlanFeatures } from "@/lib/plans";
import { ctxCan } from "@/lib/tenant";
import { updateBilling, updateOrgSettings } from "../actions";

export const metadata: Metadata = { title: "Plan" };

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  teamStats: "Ranking y estadísticas por colaborador",
  leads: "Formulario de contacto y bandeja de contactos",
  leadsExport: "Descarga CSV de contactos",
  cards: "Tarjetas físicas reasignables",
  auditLog: "Registro de acciones administrativas",
};

export default function PlanPage({ params }: PageProps<"/dashboard/[org]/plan">) {
  return (
    <Suspense fallback={<KpiSkeleton count={3} />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "stats.team");
  const showAudit = ctx.user.isPlatformAdmin || (ctxCan(ctx, "audit.view") && ctx.access.features.auditLog);
  const [activeSeats, members, cards, auditLogs] = await Promise.all([
    prisma.profile.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
    prisma.membership.count({ where: { organizationId: ctx.org.id } }),
    prisma.card.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
    showAudit
      ? prisma.auditLog.findMany({
          where: { organizationId: ctx.org.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, action: true, targetType: true, createdAt: true, actor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const included = PLAN_FEATURES[ctx.org.plan];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Plan" value={PLAN_LABELS[ctx.org.plan]} hint={ctx.access.current ? "vigente" : "vencido"} />
        <KpiCard label="Perfiles activos" value={`${activeSeats} / ${ctx.org.seatLimit}`} hint="unidad de cobro" />
        <KpiCard label="Miembros del panel" value={members} />
        <KpiCard label="Tarjetas activas" value={cards} />
      </div>

      <Card title="Qué incluye tu plan" description={ctx.org.paidUntil ? `Vigente hasta ${formatDate(ctx.org.paidUntil)}.` : "Sin fecha de vencimiento (piloto o cortesía)."}>
        <ul className="space-y-2 text-sm">
          {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((key) => (
            <li key={key} className="flex items-center gap-2">
              <span aria-hidden className={included[key] ? "text-emerald-600" : "text-slate-300"}>
                {included[key] ? "✓" : "—"}
              </span>
              <span className={included[key] ? "text-slate-800" : "text-slate-400"}>{FEATURE_LABELS[key]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">Para cambiar de plan o agregar perfiles, escríbenos: lo actualizamos el mismo día.</p>
      </Card>

      {ctxCan(ctx, "org.settings") ? (
        <Card title="Datos de la empresa">
          <ActionForm action={updateOrgSettings} keepValues submitLabel="Guardar" className="space-y-4">
            <input type="hidden" name="org" value={ctx.org.slug} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelClass}>
                Nombre
                <input name="name" required defaultValue={ctx.org.name} className={inputClass} />
              </label>
              <label className={labelClass}>
                Página de respaldo <span className="font-normal text-slate-400">(tarjetas desactivadas o sin asignar)</span>
                <input name="fallbackUrl" type="url" defaultValue={ctx.org.fallbackUrl ?? ""} placeholder="https://empresa.com" className={inputClass} />
              </label>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {ctxCan(ctx, "billing.manage") ? (
        <Card title="Facturación (solo LAZU)" description="Se cobra fuera de la plataforma; aquí se registra lo contratado.">
          <ActionForm action={updateBilling} keepValues submitLabel="Actualizar plan" className="space-y-4">
            <input type="hidden" name="org" value={ctx.org.slug} />
            <div className="grid gap-3 md:grid-cols-4">
              <label className={labelClass}>
                Plan
                <select name="plan" defaultValue={ctx.org.plan} className={inputClass}>
                  {Object.entries(PLAN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Perfiles incluidos
                <input name="seatLimit" type="number" min={1} defaultValue={ctx.org.seatLimit} className={inputClass} />
              </label>
              <label className={labelClass}>
                Vigente hasta
                <input name="paidUntil" type="date" defaultValue={ctx.org.paidUntil?.toISOString().slice(0, 10) ?? ""} className={inputClass} />
              </label>
              <label className={labelClass}>
                Estado
                <select name="status" defaultValue={ctx.org.status} className={inputClass}>
                  <option value="ACTIVE">Activa</option>
                  <option value="SUSPENDED">Suspendida</option>
                </select>
              </label>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {showAudit ? (
        <Card title="Registro de acciones" description="Últimas 50 acciones administrativas.">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">Sin acciones registradas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {auditLogs.map((log) => (
                <li key={log.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono text-xs text-navy">{log.action}</span>{" "}
                    <span className="text-slate-500">por {log.actor?.name ?? "—"}</span>
                  </span>
                  <span className="text-slate-500">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
