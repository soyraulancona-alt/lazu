import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { Card } from "@/components/card";
import { KpiSkeleton } from "@/components/kpi-card";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLAN_LABELS } from "@/lib/plans";
import { listOrganizationsFor } from "@/lib/tenant";
import { createOrganization } from "./actions";

export const metadata: Metadata = { title: "Empresas" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Empresas</h1>
        <p className="text-sm text-slate-500">Elige la cuenta que quieres administrar.</p>
      </div>
      <Suspense fallback={<KpiSkeleton count={4} />}>
        <Organizations />
      </Suspense>
    </div>
  );
}

async function Organizations() {
  const user = await requireUser();
  const orgs = await listOrganizationsFor(user);
  // Un cliente con una sola empresa entra directo a ella.
  if (user.role !== "ADMIN" && orgs.length === 1) redirect(`/dashboard/${orgs[0]!.slug}`);

  return (
    <>
      {orgs.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Todavía no perteneces a ninguna empresa. Pide a tu administrador que te agregue.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/${org.slug}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-navy/40"
            >
              <p className="font-semibold text-navy">{org.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                Plan {PLAN_LABELS[org.plan]} · {org.activeProfiles} de {org.seatLimit} perfiles activos
              </p>
              <p className="mt-3 text-xs text-slate-500">
                {org.role ? ROLE_LABELS[org.role] : "Acceso LAZU"}
                {org.status === "SUSPENDED" ? <span className="ml-2 font-semibold text-red-700">Suspendida</span> : null}
              </p>
            </Link>
          ))}
        </div>
      )}

      {user.role === "ADMIN" ? (
        <Card title="Nueva empresa" description="Alta de un cliente con su propietario. Si el correo no existe, se crea la cuenta con una contraseña temporal.">
          <ActionForm action={createOrganization} submitLabel="Crear empresa" pendingLabel="Creando…" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className={labelClass}>
                Nombre
                <input name="name" required placeholder="Inmobiliaria Norte" className={inputClass} />
              </label>
              <label className={labelClass}>
                Identificador
                <input name="slug" required placeholder="inmobiliaria-norte" pattern="[a-z0-9-]+" className={inputClass} />
              </label>
              <label className={labelClass}>
                Plan
                <select name="plan" defaultValue="TEAM" className={inputClass}>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="TEAM">Equipo</option>
                  <option value="ENTERPRISE">Empresa</option>
                </select>
              </label>
              <label className={labelClass}>
                Perfiles incluidos
                <input name="seatLimit" type="number" min={1} defaultValue={5} required className={inputClass} />
              </label>
              <label className={labelClass}>
                Nombre del propietario
                <input name="ownerName" required placeholder="María López" className={inputClass} />
              </label>
              <label className={labelClass}>
                Correo del propietario
                <input name="ownerEmail" type="email" required placeholder="maria@empresa.com" className={inputClass} />
              </label>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
