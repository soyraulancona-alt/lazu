// Crea (o actualiza la contraseña de) un usuario del dashboard.
// Uso: npm run user:create -- <email> "<nombre>" <contraseña> [ADMIN|USER]
//   ADMIN = personal de LAZU (entra a todas las empresas). USER = cliente.
// Para dar acceso a una empresa, agrégalo desde Equipo en el panel.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

async function main() {
  const [emailArg, name, password, roleArg = "USER"] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const role = roleArg.toUpperCase();
  if (!email || !name || !password || password.length < 10 || !["ADMIN", "USER"].includes(role)) {
    console.error('Uso: npm run user:create -- <email> "<nombre>" <contraseña ≥10> [ADMIN|USER]');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: role as "ADMIN" | "USER" },
    create: { email, name, passwordHash, role: role as "ADMIN" | "USER" },
  });
  console.log(`✔ Usuario ${user.email} (${user.role})`);
  await prisma.$disconnect();
}

main();
