import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { readSession } from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OWNER";
};

/**
 * Capa de acceso a datos: toda página o acción del dashboard pasa por aquí.
 * Verifica la firma del JWT y que el usuario siga existiendo.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true },
  });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Filtro Prisma con los perfiles que este usuario puede ver. */
export function profileScope(user: CurrentUser) {
  return user.role === "ADMIN" ? {} : { ownerUserId: user.id };
}
