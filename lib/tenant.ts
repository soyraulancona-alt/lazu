import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { can, type OrgAction, type OrgRole } from "./permissions";
import { planAccess, type PlanAccess, type PlanId } from "./plans";

/**
 * Contexto de empresa de una petición. Se construye solo a partir de la sesión
 * verificada y de una membresía real en la base de datos; nunca de datos que
 * envía el navegador. Todas las consultas privadas reciben este objeto y filtran
 * por ctx.org.id: es imposible pedir datos de otra empresa sin pasar por aquí.
 */
export type OrgContext = {
  user: { id: string; name: string; email: string; isPlatformAdmin: boolean };
  org: {
    id: string;
    slug: string;
    name: string;
    plan: PlanId;
    seatLimit: number;
    paidUntil: Date | null;
    status: "ACTIVE" | "SUSPENDED";
    fallbackUrl: string | null;
  };
  role: OrgRole;
  access: PlanAccess;
};

type SessionUser = { id: string; name: string; email: string; role: "ADMIN" | "USER" };

const orgSelect = {
  id: true,
  slug: true,
  name: true,
  plan: true,
  seatLimit: true,
  paidUntil: true,
  status: true,
  fallbackUrl: true,
} satisfies Prisma.OrganizationSelect;

/** null si la empresa no existe o el usuario no es miembro (no se distingue a propósito). */
export async function resolveOrgContext(user: SessionUser, orgSlug: string): Promise<OrgContext | null> {
  const isPlatformAdmin = user.role === "ADMIN";
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { ...orgSelect, memberships: { where: { userId: user.id }, select: { role: true } } },
  });
  if (!org) return null;
  const { memberships, ...orgData } = org;
  const membership = memberships[0];
  if (!membership && !isPlatformAdmin) return null;
  // Una empresa suspendida solo es visible para el personal de LAZU.
  if (org.status === "SUSPENDED" && !isPlatformAdmin) return null;

  return {
    user: { id: user.id, name: user.name, email: user.email, isPlatformAdmin },
    org: orgData,
    // El personal de LAZU actúa como propietario.
    role: membership?.role ?? "OWNER",
    access: planAccess(orgData),
  };
}

export function ctxCan(ctx: OrgContext, action: OrgAction): boolean {
  return can(ctx.role, action, ctx.user.isPlatformAdmin);
}

/**
 * Filtro de perfiles visibles: siempre la empresa del contexto y, para
 * colaboradores, solo los perfiles asignados a ellos.
 */
export function profileWhere(ctx: OrgContext): Prisma.ProfileWhereInput {
  return ctxCan(ctx, "stats.team")
    ? { organizationId: ctx.org.id }
    : { organizationId: ctx.org.id, memberUserId: ctx.user.id };
}

/** Lo mismo para contactos capturados. */
export function leadWhere(ctx: OrgContext): Prisma.LeadWhereInput {
  return ctxCan(ctx, "leads.viewAll")
    ? { organizationId: ctx.org.id }
    : { organizationId: ctx.org.id, profile: { memberUserId: ctx.user.id } };
}

/** Empresas a las que el usuario tiene acceso, para el selector del panel. */
export async function listOrganizationsFor(user: SessionUser) {
  const where: Prisma.OrganizationWhereInput =
    user.role === "ADMIN" ? {} : { status: "ACTIVE", memberships: { some: { userId: user.id } } };
  const orgs = await prisma.organization.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      ...orgSelect,
      memberships: { where: { userId: user.id }, select: { role: true } },
      _count: { select: { profiles: { where: { status: "ACTIVE" } } } },
    },
  });
  return orgs.map(({ memberships, _count, ...org }) => ({
    ...org,
    role: memberships[0]?.role ?? null,
    activeProfiles: _count.profiles,
  }));
}
