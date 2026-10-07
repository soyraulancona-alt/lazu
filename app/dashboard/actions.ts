"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forgetProfile } from "@/lib/profiles";

export type CreateProfileState = { error?: string };

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, "slug_invalid");

const createSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  ownerEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email()]),
});

export async function createProfile(
  _prev: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    ownerEmail: formData.get("ownerEmail") ?? "",
  });
  if (!parsed.success) {
    return {
      error:
        "Revisa los datos: el slug solo admite minúsculas, números y guiones; el nombre necesita al menos 2 caracteres.",
    };
  }
  const { slug, name, ownerEmail } = parsed.data;

  let ownerUserId = admin.id;
  if (ownerEmail) {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
    if (!owner) return { error: "No existe un usuario con ese email." };
    ownerUserId = owner.id;
  }

  if (await prisma.profile.findUnique({ where: { slug }, select: { id: true } })) {
    return { error: "Ese slug ya está en uso." };
  }

  await prisma.profile.create({ data: { slug, name, ownerUserId } });
  forgetProfile(slug);
  redirect(`/dashboard/profiles/${slug}`);
}

const statusSchema = z.object({
  slug: slugSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export async function setProfileStatus(formData: FormData) {
  await requireAdmin();
  const parsed = statusSchema.safeParse({
    slug: formData.get("slug"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  await prisma.profile.update({
    where: { slug: parsed.data.slug },
    data: { status: parsed.data.status },
  });
  forgetProfile(parsed.data.slug);
  redirect(`/dashboard/profiles/${parsed.data.slug}`);
}
