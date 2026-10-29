// Pruebas de aislamiento entre empresas contra una base de datos real.
// Uso: DATABASE_URL_TEST=postgresql://… npm run test:db
// (la base debe tener las migraciones aplicadas; los datos de prueba se borran al final).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/db";
import { getProfileStats, getTeamOverview } from "../../lib/stats";
import { leadWhere, listOrganizationsFor, profileWhere, resolveOrgContext } from "../../lib/tenant";

const run = Math.random().toString(36).slice(2, 8);
const ids: { orgs: string[]; users: string[] } = { orgs: [], users: [] };

type U = { id: string; name: string; email: string; role: "ADMIN" | "USER" };
let ownerA: U, memberA: U, memberA2: U, ownerB: U, staff: U;
let orgA: { id: string; slug: string }, orgB: { id: string; slug: string };

async function user(name: string, role: "ADMIN" | "USER" = "USER"): Promise<U> {
  const u = await prisma.user.create({
    data: { email: `${name}-${run}@test.lazu`, name, passwordHash: "x", role },
    select: { id: true, name: true, email: true, role: true },
  });
  ids.users.push(u.id);
  return u;
}

async function org(slug: string, members: [U, "OWNER" | "ADMIN" | "MEMBER"][]) {
  const o = await prisma.organization.create({
    data: {
      slug: `${slug}-${run}`,
      name: slug,
      memberships: { create: members.map(([u, role]) => ({ userId: u.id, role })) },
    },
    select: { id: true, slug: true },
  });
  ids.orgs.push(o.id);
  return o;
}

async function profileWithActivity(orgId: string, slug: string, memberUserId: string | null, whatsapp: number) {
  const p = await prisma.profile.create({
    data: { organizationId: orgId, slug: `${slug}-${run}`, name: slug, memberUserId },
  });
  await prisma.event.createMany({
    data: Array.from({ length: whatsapp }, () => ({
      organizationId: orgId,
      profileId: p.id,
      eventType: "whatsapp_click",
      deviceType: "mobile",
    })),
  });
  await prisma.lead.create({
    data: { organizationId: orgId, profileId: p.id, name: `Lead ${slug}`, phone: "5512345678", consentAt: new Date(), consentVersion: "t" },
  });
  return p;
}

before(async () => {
  ownerA = await user("owner-a");
  memberA = await user("member-a");
  memberA2 = await user("member-a2");
  ownerB = await user("owner-b");
  staff = await user("staff", "ADMIN");
  orgA = await org("empresa-a", [
    [ownerA, "OWNER"],
    [memberA, "MEMBER"],
    [memberA2, "MEMBER"],
  ]);
  orgB = await org("empresa-b", [[ownerB, "OWNER"]]);
  await profileWithActivity(orgA.id, "ana", memberA.id, 3);
  await profileWithActivity(orgA.id, "beto", memberA2.id, 5);
  await profileWithActivity(orgB.id, "carla", ownerB.id, 7);
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: ids.orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

test("un usuario no obtiene contexto de una empresa donde no es miembro", async () => {
  assert.equal(await resolveOrgContext(ownerA, orgB.slug), null);
  assert.equal(await resolveOrgContext(ownerB, orgA.slug), null);
  assert.equal(await resolveOrgContext(memberA, "no-existe-" + run), null);
  const ctx = await resolveOrgContext(memberA, orgA.slug);
  assert.equal(ctx?.role, "MEMBER");
  assert.deepEqual(
    (await listOrganizationsFor(ownerA)).map((o) => o.slug),
    [orgA.slug],
  );
});

test("el resumen del propietario solo incluye datos de su empresa", async () => {
  const ctx = (await resolveOrgContext(ownerA, orgA.slug))!;
  const data = await getTeamOverview(ctx);
  assert.deepEqual(data.rows.map((r) => r.name).sort(), ["ana", "beto"]);
  assert.equal(data.counts30.whatsapp_click, 8, "3 + 5, sin los 7 de la empresa B");
  assert.equal(data.leads30, 2);
});

test("un colaborador solo ve su propio perfil y sus contactos", async () => {
  const ctx = (await resolveOrgContext(memberA, orgA.slug))!;
  const data = await getTeamOverview(ctx);
  assert.deepEqual(data.rows.map((r) => r.name), ["ana"]);
  assert.equal(data.counts30.whatsapp_click, 3);
  assert.equal(await prisma.lead.count({ where: leadWhere(ctx) }), 1);
  assert.equal(await prisma.profile.count({ where: profileWhere(ctx) }), 1);
  assert.equal(await getProfileStats(ctx, `beto-${run}`), null, "perfil de un compañero");
});

test("no se pueden leer estadísticas de un perfil de otra empresa conociendo su slug", async () => {
  const ctx = (await resolveOrgContext(ownerA, orgA.slug))!;
  assert.equal(await getProfileStats(ctx, `carla-${run}`), null);
  assert.ok(await getProfileStats(ctx, `ana-${run}`));
});

test("el personal de LAZU entra a cualquier empresa como propietario", async () => {
  const ctx = await resolveOrgContext(staff, orgB.slug);
  assert.equal(ctx?.role, "OWNER");
  assert.equal(ctx?.user.isPlatformAdmin, true);
});

test("una empresa suspendida deja de ser visible para sus miembros", async () => {
  await prisma.organization.update({ where: { id: orgB.id }, data: { status: "SUSPENDED" } });
  assert.equal(await resolveOrgContext(ownerB, orgB.slug), null);
  assert.ok(await resolveOrgContext(staff, orgB.slug));
});
