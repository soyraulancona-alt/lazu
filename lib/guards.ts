import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "./auth";
import type { OrgAction } from "./permissions";
import { ctxCan, resolveOrgContext, type OrgContext } from "./tenant";

const getOrgContext = cache(async (orgSlug: string) => {
  const user = await requireUser();
  return resolveOrgContext(user, orgSlug);
});

/**
 * Exige sesión, membresía en la empresa y, opcionalmente, un permiso.
 * Sin membresía o sin permiso responde 404: no se revela si la empresa existe.
 * Se llama en cada página, route handler y server action; ocultar un botón en la
 * interfaz nunca es la única protección.
 */
export async function requireOrg(orgSlug: string, action: OrgAction = "org.view"): Promise<OrgContext> {
  const ctx = await getOrgContext(orgSlug);
  if (!ctx || !ctxCan(ctx, action)) notFound();
  return ctx;
}
