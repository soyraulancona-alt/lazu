import { Suspense } from "react";
import { OrgNav } from "@/components/org-nav";
import { formatDate } from "@/lib/format";
import { requireOrg } from "@/lib/guards";
import { PLAN_LABELS } from "@/lib/plans";
import { ctxCan } from "@/lib/tenant";

export default function OrgLayout({ children, params }: LayoutProps<"/dashboard/[org]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-20" />}>
        <OrgHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function OrgHeader({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const base = `/dashboard/${ctx.org.slug}`;
  const items = [{ href: base, label: "Resumen" }];
  if (ctxCan(ctx, "profiles.manage")) items.push({ href: `${base}/team`, label: "Equipo" });
  if (ctxCan(ctx, "cards.manage")) items.push({ href: `${base}/cards`, label: "Tarjetas" });
  items.push({ href: `${base}/leads`, label: "Contactos" });
  if (ctxCan(ctx, "stats.team")) items.push({ href: `${base}/plan`, label: "Plan" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-navy">{ctx.org.name}</h1>
        <p className="text-xs text-slate-500">
          Plan {PLAN_LABELS[ctx.org.plan]}
          {ctx.org.paidUntil ? ` · vigente hasta ${formatDate(ctx.org.paidUntil)}` : ""}
        </p>
      </div>
      {ctx.org.status === "SUSPENDED" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Empresa suspendida: sus perfiles no registran actividad y sus tarjetas no abren. Solo LAZU la ve.
        </p>
      ) : !ctx.access.current ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La vigencia del plan terminó. Seguimos registrando la actividad de tu equipo, pero el ranking, los contactos
          y las tarjetas quedan bloqueados hasta renovar. Escríbenos para reactivarlos.
        </p>
      ) : null}
      <div className="border-b border-slate-200">
        <OrgNav items={items} />
      </div>
    </div>
  );
}
