import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { OrgContext } from "./tenant";

/** Deja constancia de una acción administrativa. Nunca guarda contraseñas ni datos de contactos. */
export async function audit(
  ctx: OrgContext,
  action: string,
  target: { type: string; id?: string | null },
  metadata?: Prisma.InputJsonObject,
) {
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      metadata: metadata ?? undefined,
    },
  });
}
