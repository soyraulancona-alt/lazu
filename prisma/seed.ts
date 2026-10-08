// Seed idempotente: crea el usuario administrador y el perfil test-profile.
// Uso: npm run db:seed   (o automáticamente con `prisma migrate reset`)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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

  const profile = await prisma.profile.upsert({
    where: { slug: "test-profile" },
    update: {},
    create: {
      slug: "test-profile",
      name: "Perfil de Prueba LAZU",
      status: "ACTIVE",
      ownerUserId: admin.id,
    },
  });

  console.log(`✔ Admin: ${admin.email}`);
  console.log(`✔ Perfil: ${profile.slug} (${profile.status})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
