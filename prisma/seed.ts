// Seed idempotente: crea el administrador de LAZU, una empresa de demostración
// con el perfil test-profile y una tarjeta asignada.
// Uso: npm run db:seed   (o automáticamente con `prisma migrate reset`)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CARD_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    if (process.env.VERCEL) {
      console.log("Seed omitido: define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el admin.");
      return;
    }
    throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 10 caracteres) en .env");
  }
  const baseUrl = (process.env.CARD_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Administrador LAZU",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "lazu-demo" },
    update: {},
    create: {
      slug: "lazu-demo",
      name: "LAZU Demo",
      plan: "TEAM",
      seatLimit: 5,
      memberships: { create: { userId: admin.id, role: "OWNER" } },
    },
  });

  const profile = await prisma.profile.upsert({
    where: { slug: "test-profile" },
    update: {},
    create: {
      slug: "test-profile",
      name: "Perfil de Prueba LAZU",
      status: "ACTIVE",
      organizationId: org.id,
      memberUserId: admin.id,
      jobTitle: "Asesor comercial",
      whatsapp: "5215512345678",
      publicUrl: `${baseUrl}/test-profile.html`,
    },
  });

  if ((await prisma.card.count({ where: { organizationId: org.id } })) === 0) {
    const code = Array.from({ length: 8 }, () => CARD_ALPHABET[randomInt(CARD_ALPHABET.length)]).join("");
    await prisma.card.create({
      data: { organizationId: org.id, code, label: "Demo", profileId: profile.id, assignedAt: new Date() },
    });
    console.log(`✔ Tarjeta: ${baseUrl}/c/${code}`);
  }

  console.log(`✔ Admin: ${admin.email}`);
  console.log(`✔ Empresa: ${org.slug}`);
  console.log(`✔ Perfil: ${profile.slug} (${profile.status})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
