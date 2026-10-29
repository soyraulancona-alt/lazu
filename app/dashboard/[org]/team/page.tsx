import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { Card } from "@/components/card";
import { KpiSkeleton } from "@/components/kpi-card";
import { ProfileFields } from "@/components/profile-fields";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/guards";
import { canAssignRole, ROLE_LABELS, type OrgRole } from "@/lib/permissions";
import { seatsAvailable } from "@/lib/plans";
import { addMember, createProfile, removeMember, updateMemberRole } from "../actions";

export const metadata: Metadata = { title: "Equipo" };

export default function TeamPage({ params }: PageProps<"/dashboard/[org]/team">) {
  return (
    <Suspense fallback={<KpiSkeleton count={4} />}>
      <Team params={params} />
    </Suspense>
  );
}

const ROLES: OrgRole[] = ["OWNER", "ADMIN", "MEMBER"];

async function Team({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "profiles.manage");
  const [members, profiles] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: ctx.org.id },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.profile.findMany({
      where: { organizationId: ctx.org.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        publicUrl: true,
        member: { select: { name: true } },
        _count: { select: { cards: true } },
      },
    }),
  ]);
  const active = profiles.filter((p) => p.status === "ACTIVE").length;
  const free = seatsAvailable(ctx.org.seatLimit, active);
  const base = `/dashboard/${ctx.org.slug}`;
  const assignable = ROLES.filter((r) => canAssignRole(ctx.role, r, null, ctx.user.isPlatformAdmin));

  return (
    <div className="space-y-6">
      <Card title="Miembros" description="Quién entra al panel. Los colaboradores solo ven sus propios perfiles y contactos.">
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Persona</th>
                <th className="px-5 py-3 font-medium">Rol</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const editable = canAssignRole(ctx.role, m.role, m.role, ctx.user.isPlatformAdmin);
                return (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy">{m.user.name}</p>
                      <p className="text-xs text-slate-500">{m.user.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      {editable ? (
                        <ActionForm action={updateMemberRole} keepValues submitLabel="Cambiar" variant="secondary" className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="org" value={ctx.org.slug} />
                          <input type="hidden" name="id" value={m.id} />
                          <select name="role" defaultValue={m.role} aria-label="Rol" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </ActionForm>
                      ) : (
                        ROLE_LABELS[m.role]
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editable ? (
                        <ActionForm action={removeMember} submitLabel="Quitar" pendingLabel="Quitando…" variant="secondary">
                          <input type="hidden" name="org" value={ctx.org.slug} />
                          <input type="hidden" name="id" value={m.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Agregar miembro" description="Si la persona no tiene cuenta, se crea con una contraseña temporal que verás una sola vez.">
        <ActionForm action={addMember} submitLabel="Agregar" pendingLabel="Agregando…" className="space-y-4">
          <input type="hidden" name="org" value={ctx.org.slug} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>
              Nombre
              <input name="name" required placeholder="Ana Torres" className={inputClass} />
            </label>
            <label className={labelClass}>
              Correo
              <input name="email" type="email" required placeholder="ana@empresa.com" className={inputClass} />
            </label>
            <label className={labelClass}>
              Rol
              <select name="role" defaultValue="MEMBER" className={inputClass}>
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card
        title="Perfiles"
        description={`${active} de ${ctx.org.seatLimit} perfiles activos incluidos en el plan. Cada perfil es un HTML independiente con su LAZU_PROFILE_ID.`}
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay perfiles. Crea el primero abajo.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Perfil</th>
                  <th className="px-5 py-3 font-medium">Colaborador</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Tarjetas</th>
                  <th className="px-5 py-3 font-medium">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`${base}/profiles/${p.slug}`} className="font-medium text-navy hover:text-orange-600">
                        {p.name}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{p.slug}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.member?.name ?? "Sin asignar"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{p._count.cards}</td>
                    <td className="px-5 py-3 text-slate-600">{p.publicUrl ? "Sí" : <span className="text-amber-700">Falta URL</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Nuevo perfil" description={free > 0 ? `Quedan ${free} perfiles activos disponibles en el plan.` : "El plan está completo: pausa un perfil o amplía el plan para crear otro."}>
        <ActionForm action={createProfile} submitLabel="Crear perfil" pendingLabel="Creando…" className="space-y-4">
          <input type="hidden" name="org" value={ctx.org.slug} />
          <label className={`${labelClass} max-w-sm`}>
            Identificador público (LAZU_PROFILE_ID)
            <input name="slug" required placeholder="ana-torres-norte" pattern="[a-z0-9-]+" className={inputClass} />
          </label>
          <ProfileFields members={members.map((m) => m.user)} />
        </ActionForm>
      </Card>
    </div>
  );
}
