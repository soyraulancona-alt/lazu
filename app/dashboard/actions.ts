"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, temporaryPassword } from "@/lib/passwords";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  plan: z.enum(["INDIVIDUAL", "TEAM", "ENTERPRISE"]),
  seatLimit: z.coerce.number().int().min(1).max(10_000),
  ownerEmail: z.string().trim().toLowerCase().email().max(200),
  ownerName: z.string().trim().min(2).max(120),
});

/** Alta de un cliente (solo personal de LAZU): empresa + propietario. */
export async function createOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const parsed = createOrgSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    plan: field(formData, "plan"),
    seatLimit: field(formData, "seatLimit"),
    ownerEmail: field(formData, "ownerEmail"),
    ownerName: field(formData, "ownerName"),
  });
  if (!parsed.success) {
    return { error: "Revisa los datos: el identificador solo admite minúsculas, números y guiones." };
  }
  const { ownerEmail, ownerName, ...org } = parsed.data;
  if (await prisma.organization.findUnique({ where: { slug: org.slug }, select: { id: true } })) {
    return { error: "Ese identificador de empresa ya existe." };
  }

  let secret: string | undefined;
  let owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
  if (!owner) {
    secret = temporaryPassword();
    owner = await prisma.user.create({
      data: { email: ownerEmail, name: ownerName, passwordHash: await hashPassword(secret) },
      select: { id: true },
    });
  }

  const created = await prisma.organization.create({
    data: {
      ...org,
      memberships: { create: { userId: owner.id, role: "OWNER" } },
      auditLogs: { create: { actorUserId: admin.id, action: "org.create", targetType: "organization" } },
    },
  });
  if (secret) {
    return {
      ok: `Empresa ${created.name} creada. Su propietario entra con ${ownerEmail} y esta contraseña.`,
      secret,
    };
  }
  redirect(`/dashboard/${created.slug}`);
}

const passwordSchema = z
  .object({
    current: z.string().min(1).max(200),
    next: z.string().min(MIN_PASSWORD_LENGTH).max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "mismatch" });

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({
    current: field(formData, "current"),
    next: field(formData, "next"),
    confirm: field(formData, "confirm"),
  });
  if (!parsed.success) {
    return { error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres y coincidir en ambos campos.` };
  }
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await bcrypt.compare(parsed.data.current, row.passwordHash))) {
    return { error: "La contraseña actual no es correcta." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: "Contraseña actualizada." };
}
