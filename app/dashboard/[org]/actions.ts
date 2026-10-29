"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { generateCardCode } from "@/lib/card-code";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/guards";
import { hashPassword, temporaryPassword } from "@/lib/passwords";
import { canAssignRole } from "@/lib/permissions";
import { forgetAllProfiles, forgetProfile } from "@/lib/profiles";
import { leadWhere } from "@/lib/tenant";
import { publicUrlSchema } from "@/lib/urls";

// Toda acción: (1) lee la empresa del formulario, (2) requireOrg verifica sesión,
// membresía y permiso en el servidor, (3) toda búsqueda incluye organizationId
// para que un id de otra empresa nunca se encuentre.

const orgSlugSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const idSchema = z.string().min(1).max(40);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function ctxFrom(formData: FormData, action: Parameters<typeof requireOrg>[1]) {
  const slug = orgSlugSchema.safeParse(field(formData, "org"));
  if (!slug.success) throw new Error("org_invalid");
  return requireOrg(slug.data, action);
}

// ─── Perfiles ────────────────────────────────────────────────────

const profileFields = {
  name: z.string().trim().min(2).max(120),
  jobTitle: optional(120),
  phone: optional(40),
  whatsapp: optional(40),
  email: z.union([z.literal("").transform(() => null), z.string().trim().toLowerCase().email().max(200)]),
  publicUrl: publicUrlSchema,
  memberUserId: z.string().max(40).transform((s) => s || null),
};

function readProfileFields(formData: FormData) {
  return {
    name: field(formData, "name"),
    jobTitle: field(formData, "jobTitle"),
    phone: field(formData, "phone"),
    whatsapp: field(formData, "whatsapp"),
    email: field(formData, "email"),
    publicUrl: field(formData, "publicUrl"),
    memberUserId: field(formData, "memberUserId"),
  };
}

/** El colaborador asignado debe ser miembro de esta misma empresa. */
async function memberBelongs(orgId: string, userId: string | null) {
  if (!userId) return true;
  return !!(await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { id: true },
  }));
}

async function activeSeats(orgId: string) {
  return prisma.profile.count({ where: { organizationId: orgId, status: "ACTIVE" } });
}

export async function createProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "profiles.manage");
  const parsed = z
    .object({ slug: slugSchema, ...profileFields })
    .safeParse({ slug: field(formData, "slug"), ...readProfileFields(formData) });
  if (!parsed.success) {
    return { error: "Revisa los datos: el identificador solo admite minúsculas, números y guiones, y las URLs deben empezar con https://." };
  }
  const data = parsed.data;
  if (!(await memberBelongs(ctx.org.id, data.memberUserId))) return { error: "Ese colaborador no es miembro de la empresa." };
  if ((await activeSeats(ctx.org.id)) >= ctx.org.seatLimit) {
    return { error: `Tu plan incluye ${ctx.org.seatLimit} perfiles activos. Pausa uno o amplía el plan.` };
  }
  if (await prisma.profile.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
    return { error: "Ese identificador ya está en uso. Prueba con otro (p. ej. agrega la empresa)." };
  }

  const profile = await prisma.profile.create({ data: { ...data, organizationId: ctx.org.id } });
  forgetProfile(profile.slug);
  await audit(ctx, "profile.create", { type: "profile", id: profile.id }, { slug: profile.slug });
  refresh();
  return { ok: `Perfil ${profile.slug} creado.` };
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "profiles.manage");
  const parsed = z
    .object({ id: idSchema, status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]), ...profileFields })
    .safeParse({ id: field(formData, "id"), status: field(formData, "status"), ...readProfileFields(formData) });
  if (!parsed.success) return { error: "Revisa los datos: las URLs deben empezar con https:// y el correo debe ser válido." };
  const { id, ...data } = parsed.data;

  const current = await prisma.profile.findFirst({
    where: { id, organizationId: ctx.org.id },
    select: { id: true, slug: true, status: true },
  });
  if (!current) return { error: "Perfil no encontrado." };
  if (!(await memberBelongs(ctx.org.id, data.memberUserId))) return { error: "Ese colaborador no es miembro de la empresa." };
  // Solo el personal de LAZU puede suspender o levantar una suspensión.
  if ((data.status === "SUSPENDED" || current.status === "SUSPENDED") && data.status !== current.status && !ctx.user.isPlatformAdmin) {
    return { error: "Solo LAZU puede suspender o reactivar un perfil suspendido." };
  }
  if (data.status === "ACTIVE" && current.status !== "ACTIVE" && (await activeSeats(ctx.org.id)) >= ctx.org.seatLimit) {
    return { error: `Tu plan incluye ${ctx.org.seatLimit} perfiles activos. Pausa otro o amplía el plan.` };
  }

  await prisma.profile.update({ where: { id: current.id }, data });
  forgetProfile(current.slug);
  await audit(ctx, "profile.update", { type: "profile", id: current.id }, { status: data.status });
  refresh();
  return { ok: "Cambios guardados." };
}

// ─── Miembros ────────────────────────────────────────────────────

const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "members.manage");
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email().max(200),
      name: z.string().trim().min(2).max(120),
      role: roleSchema,
    })
    .safeParse({ email: field(formData, "email"), name: field(formData, "name"), role: field(formData, "role") });
  if (!parsed.success) return { error: "Escribe un nombre y un correo válidos." };
  const { email, name, role } = parsed.data;
  if (!canAssignRole(ctx.role, role, null, ctx.user.isPlatformAdmin)) {
    return { error: "Solo un propietario puede nombrar a otro propietario." };
  }

  let secret: string | undefined;
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    secret = temporaryPassword();
    user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(secret) },
      select: { id: true },
    });
  }
  const exists = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: ctx.org.id, userId: user.id } },
    select: { id: true },
  });
  if (exists) return { error: "Esa persona ya es miembro de la empresa." };

  const membership = await prisma.membership.create({
    data: { organizationId: ctx.org.id, userId: user.id, role },
  });
  await audit(ctx, "member.add", { type: "membership", id: membership.id }, { role });
  refresh();
  return secret
    ? { ok: `${name} fue agregado. Entra en /login con su correo y esta contraseña.`, secret }
    : { ok: `${name} ya tenía cuenta en LAZU y fue agregado con su contraseña actual.` };
}

async function findMembership(orgId: string, membershipId: string) {
  return prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: { id: true, role: true, userId: true },
  });
}

async function isLastOwner(orgId: string, membership: { role: string }) {
  if (membership.role !== "OWNER") return false;
  return (await prisma.membership.count({ where: { organizationId: orgId, role: "OWNER" } })) <= 1;
}

export async function updateMemberRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "members.manage");
  const parsed = z.object({ id: idSchema, role: roleSchema }).safeParse({ id: field(formData, "id"), role: field(formData, "role") });
  if (!parsed.success) return { error: "Datos inválidos." };
  const membership = await findMembership(ctx.org.id, parsed.data.id);
  if (!membership) return { error: "Miembro no encontrado." };
  if (!canAssignRole(ctx.role, parsed.data.role, membership.role, ctx.user.isPlatformAdmin)) {
    return { error: "Solo un propietario puede cambiar el rol de un propietario." };
  }
  if (parsed.data.role !== "OWNER" && (await isLastOwner(ctx.org.id, membership))) {
    return { error: "La empresa necesita al menos un propietario." };
  }
  await prisma.membership.update({ where: { id: membership.id }, data: { role: parsed.data.role } });
  await audit(ctx, "member.role", { type: "membership", id: membership.id }, { from: membership.role, to: parsed.data.role });
  refresh();
  return { ok: "Rol actualizado." };
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "members.manage");
  const membership = await findMembership(ctx.org.id, field(formData, "id"));
  if (!membership) return { error: "Miembro no encontrado." };
  if (!canAssignRole(ctx.role, membership.role, membership.role, ctx.user.isPlatformAdmin)) {
    return { error: "Solo un propietario puede quitar a un propietario." };
  }
  if (await isLastOwner(ctx.org.id, membership)) return { error: "La empresa necesita al menos un propietario." };

  // Sus perfiles y contactos se quedan en la empresa, sin colaborador asignado.
  await prisma.$transaction([
    prisma.profile.updateMany({
      where: { organizationId: ctx.org.id, memberUserId: membership.userId },
      data: { memberUserId: null },
    }),
    prisma.membership.delete({ where: { id: membership.id } }),
  ]);
  await audit(ctx, "member.remove", { type: "membership", id: membership.id });
  refresh();
  return { ok: "Miembro quitado. Sus perfiles siguen en la empresa sin colaborador asignado." };
}

// ─── Tarjetas ────────────────────────────────────────────────────

export async function createCards(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "cards.manage");
  if (!ctx.access.features.cards) return { error: "Tu plan no incluye tarjetas o la vigencia venció." };
  const parsed = z
    .object({ count: z.coerce.number().int().min(1).max(200), label: optional(60) })
    .safeParse({ count: field(formData, "count"), label: field(formData, "label") });
  if (!parsed.success) return { error: "Indica entre 1 y 200 tarjetas." };

  const { count, label } = parsed.data;
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateCardCode());
  // skipDuplicates descarta en silencio la improbable colisión con un código existente.
  const result = await prisma.card.createMany({
    data: [...codes].map((code, i) => ({
      organizationId: ctx.org.id,
      code,
      label: label ? `${label} ${i + 1}` : null,
    })),
    skipDuplicates: true,
  });
  await audit(ctx, "card.create", { type: "card" }, { count: result.count });
  refresh();
  return { ok: `${result.count} tarjetas creadas.` };
}

export async function assignCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "cards.manage");
  const parsed = z
    .object({ id: idSchema, profileId: z.string().max(40), status: z.enum(["ACTIVE", "INACTIVE"]) })
    .safeParse({ id: field(formData, "id"), profileId: field(formData, "profileId"), status: field(formData, "status") });
  if (!parsed.success) return { error: "Datos inválidos." };
  const { id, profileId, status } = parsed.data;

  const card = await prisma.card.findFirst({
    where: { id, organizationId: ctx.org.id },
    select: { id: true, profileId: true },
  });
  if (!card) return { error: "Tarjeta no encontrada." };
  // El perfil debe ser de la misma empresa: no se puede apuntar una tarjeta a un perfil ajeno.
  if (profileId && !(await prisma.profile.findFirst({ where: { id: profileId, organizationId: ctx.org.id }, select: { id: true } }))) {
    return { error: "Perfil no encontrado." };
  }

  const newProfileId = profileId || null;
  await prisma.card.update({
    where: { id: card.id },
    data: {
      status,
      profileId: newProfileId,
      assignedAt: newProfileId !== card.profileId ? (newProfileId ? new Date() : null) : undefined,
    },
  });
  await audit(ctx, "card.update", { type: "card", id: card.id }, { from: card.profileId, to: newProfileId, status });
  refresh();
  return { ok: "Guardado." };
}

// ─── Contactos ───────────────────────────────────────────────────

export async function updateLeadStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "org.view");
  const parsed = z
    .object({ id: idSchema, status: z.enum(["NEW", "CONTACTED", "WON", "LOST"]) })
    .safeParse({ id: field(formData, "id"), status: field(formData, "status") });
  if (!parsed.success) return { error: "Datos inválidos." };
  // leadWhere: un colaborador solo puede tocar contactos de sus propios perfiles.
  const result = await prisma.lead.updateMany({
    where: { ...leadWhere(ctx), id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  if (result.count === 0) return { error: "Contacto no encontrado." };
  refresh();
  return { ok: "Actualizado." };
}

// ─── Empresa y plan ──────────────────────────────────────────────

export async function updateOrgSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "org.settings");
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), fallbackUrl: publicUrlSchema })
    .safeParse({ name: field(formData, "name"), fallbackUrl: field(formData, "fallbackUrl") });
  if (!parsed.success) return { error: "Revisa el nombre y la URL (debe empezar con https://)." };
  await prisma.organization.update({ where: { id: ctx.org.id }, data: parsed.data });
  await audit(ctx, "org.settings", { type: "organization", id: ctx.org.id });
  refresh();
  return { ok: "Guardado." };
}

export async function updateBilling(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await ctxFrom(formData, "billing.manage");
  const parsed = z
    .object({
      plan: z.enum(["INDIVIDUAL", "TEAM", "ENTERPRISE"]),
      seatLimit: z.coerce.number().int().min(1).max(10_000),
      paidUntil: z.union([z.literal("").transform(() => null), z.iso.date().transform((d) => new Date(`${d}T23:59:59Z`))]),
      status: z.enum(["ACTIVE", "SUSPENDED"]),
    })
    .safeParse({
      plan: field(formData, "plan"),
      seatLimit: field(formData, "seatLimit"),
      paidUntil: field(formData, "paidUntil"),
      status: field(formData, "status"),
    });
  if (!parsed.success) return { error: "Revisa plan, asientos y fecha." };
  await prisma.organization.update({ where: { id: ctx.org.id }, data: parsed.data });
  // El plan y el estado de la empresa afectan a todos sus perfiles públicos.
  forgetAllProfiles();
  await audit(ctx, "org.billing", { type: "organization", id: ctx.org.id }, {
    plan: parsed.data.plan,
    seatLimit: parsed.data.seatLimit,
    paidUntil: parsed.data.paidUntil?.toISOString() ?? null,
    status: parsed.data.status,
  });
  refresh();
  return { ok: "Plan actualizado." };
}
