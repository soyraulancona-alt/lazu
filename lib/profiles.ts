import "server-only";
import { prisma } from "./db";

type CachedProfile = { id: string; active: boolean; expiresAt: number };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedProfile>();

/**
 * Busca un perfil por slug con una caché en memoria de 60 s para que
 * /api/track responda rápido. Devuelve null si no existe o no está activo.
 */
export async function findActiveProfileId(slug: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(slug);
  if (hit && hit.expiresAt > now) return hit.active ? hit.id : null;

  const profile = await prisma.profile.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (cache.size > 10_000) cache.clear();
  cache.set(slug, {
    id: profile?.id ?? "",
    active: profile?.status === "ACTIVE",
    expiresAt: now + CACHE_TTL_MS,
  });
  return profile?.status === "ACTIVE" ? profile.id : null;
}

/** Invalida la caché cuando el dashboard cambia el estado de un perfil. */
export function forgetProfile(slug: string) {
  cache.delete(slug);
}
