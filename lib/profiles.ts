import "server-only";
import { prisma } from "./db";
import { planAccess, type PlanId } from "./plans";

export type ActiveProfile = {
  id: string;
  organizationId: string;
  /** La empresa puede recibir contactos (plan vigente que los incluye). */
  leadsEnabled: boolean;
};

type CachedProfile = { value: ActiveProfile | null; expiresAt: number };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedProfile>();

/**
 * Busca un perfil por slug con una caché en memoria de 60 s para que
 * /api/track y /api/leads respondan rápido. Devuelve null si no existe, no está
 * activo o su empresa está suspendida.
 */
export async function findActiveProfile(slug: string): Promise<ActiveProfile | null> {
  const now = Date.now();
  const hit = cache.get(slug);
  if (hit && hit.expiresAt > now) return hit.value;

  const profile = await prisma.profile.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      organizationId: true,
      organization: { select: { status: true, plan: true, paidUntil: true } },
    },
  });
  const value =
    profile && profile.status === "ACTIVE" && profile.organization.status === "ACTIVE"
      ? {
          id: profile.id,
          organizationId: profile.organizationId,
          leadsEnabled: planAccess({
            plan: profile.organization.plan as PlanId,
            paidUntil: profile.organization.paidUntil,
          }).features.leads,
        }
      : null;
  if (cache.size > 10_000) cache.clear();
  cache.set(slug, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/** Invalida la caché cuando el dashboard cambia un perfil o su empresa. */
export function forgetProfile(slug: string) {
  cache.delete(slug);
}

export function forgetAllProfiles() {
  cache.clear();
}
