// Genera un HTML independiente por colaborador a partir de la plantilla de su empresa.
// Uso: npm run profiles:generate -- <empresa> <plantilla.html> <carpeta-salida> [--endpoint URL]
//   <empresa>   identificador de la empresa en el panel (p. ej. inmobiliaria-norte)
//   --endpoint  URL de /api/track (por defecto https://app.lazu.bio/api/track)
// Después, sube los archivos al hosting y pega su URL en "URL publicada" de cada perfil.
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { renderProfile, validateTemplate } from "../lib/profile-template";

async function main() {
  const args = process.argv.slice(2);
  const endpointFlag = args.indexOf("--endpoint");
  const endpoint = endpointFlag >= 0 ? args.splice(endpointFlag, 2)[1] : "https://app.lazu.bio/api/track";
  const [orgSlug, templatePath, outDir] = args;
  if (!orgSlug || !templatePath || !outDir || !endpoint) {
    console.error("Uso: npm run profiles:generate -- <empresa> <plantilla.html> <carpeta-salida> [--endpoint URL]");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf8").replace(
    /const\s+LAZU_ENDPOINT\s*=\s*"[^"]*"/,
    `const LAZU_ENDPOINT = ${JSON.stringify(endpoint)}`,
  );
  const issues = validateTemplate(template);
  if (issues.length) {
    console.error("La plantilla no cumple el contrato de LAZU:\n- " + issues.join("\n- "));
    process.exit(1);
  }
  const tracker = readFileSync(new URL("../tracker/lazu-tracker.js", import.meta.url), "utf8");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      name: true,
      profiles: {
        where: { status: "ACTIVE" },
        orderBy: { slug: "asc" },
        select: { slug: true, name: true, jobTitle: true, phone: true, whatsapp: true, email: true, publicUrl: true },
      },
    },
  });
  await prisma.$disconnect();
  if (!org) {
    console.error(`No existe la empresa ${orgSlug}.`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  for (const profile of org.profiles) {
    const file = join(outDir, `${profile.slug}.html`);
    writeFileSync(file, renderProfile(template, { ...profile, company: org.name }, tracker));
    console.log(`✔ ${file}${profile.publicUrl ? "" : "  (falta la URL publicada en el panel)"}`);
  }
  console.log(`${org.profiles.length} perfiles generados para ${org.name}.`);
}

main();
