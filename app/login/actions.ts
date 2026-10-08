"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = { error?: string; email?: string };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// 10 intentos por IP cada 15 minutos.
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

// Hash ficticio para que el tiempo de respuesta no revele si el email existe.
const DUMMY_HASH = "$2b$12$d0tspWFX/Kqvk/VgPmB/Ue3ykm2l4NE6QGaBUQnP0.bNkVaTeo8t6";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) return { error: "Escribe un email y una contraseña válidos.", email };

  const ip = clientIp(await headers());
  if (!loginLimiter.check(`login:${ip}`).allowed) {
    return { error: "Demasiados intentos. Espera unos minutos.", email };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "Email o contraseña incorrectos.", email };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
