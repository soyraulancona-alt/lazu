// Crea (o actualiza la contraseña de) un usuario del dashboard.
// Uso: npm run user:create -- <email> "<nombre>" <contraseña> [ADMIN|OWNER]
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

async function main() {
  const [emailArg, name, password, roleArg = "OWNER"] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const role = roleArg.toUpperCase();
  if (!email || !name || !password || password.length < 10 || !["ADMIN", "OWNER"].includes(role)) {
    console.error('Uso: npm run user:create -- <email> "<nombre>" <contraseña ≥10> [ADMIN|OWNER]');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: role as "ADMIN" | "OWNER" },
    create: { email, name, passwordHash, role: role as "ADMIN" | "OWNER" },
  });
  console.log(`✔ Usuario ${user.email} (${user.role})`);
  await prisma.$disconnect();
}

main();
