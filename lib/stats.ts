import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { config } from "./config";
import { prisma } from "./db";
import { ALL_EVENT_TYPES, type EventType } from "./events";
import { ctxCan, leadWhere, profileWhere, type OrgContext } from "./tenant";

export const CHART_DAYS = 30;
/** Un perfil sin actividad en este plazo se marca como "sin uso" en el panel. */
export const IDLE_DAYS = 14;

export type DailyPoint = { day: string; visits: number; interactions: number };
export type EventCounts = Record<EventType, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyCounts(): EventCounts {
  return Object.fromEntries(ALL_EVENT_TYPES.map((t) => [t, 0])) as EventCounts;
}

function toCounts(rows: { eventType: string; _count: { _all: number } }[]): EventCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    if (row.eventType in counts) counts[row.eventType as EventType] += row._count._all;
  }
  return counts;
}

function sum(counts: EventCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Los últimos N días (YYYY-MM-DD) en la zona horaria del dashboard, del más antiguo a hoy. */
export function lastDays(n: number, timeZone: string, now = new Date()): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now); // YYYY-MM-DD
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/**
 * Filtro SQL equivalente a profileWhere(ctx) para consultas crudas.
 * Siempre incluye la empresa; para colaboradores, además, sus propios perfiles.
 */
function sqlScope(ctx: OrgContext): Prisma.Sql {
  const org = Prisma.sql`e."organizationId" = ${ctx.org.id}`;
  return ctxCan(ctx, "stats.team") ? org : Prisma.sql`${org} AND p."memberUserId" = ${ctx.user.id}`;
}

/** Serie diaria (visitas vs. interacciones). */
async function dailySeries(scope: Prisma.Sql): Promise<DailyPoint[]> {
  const tz = config.dashboardTimeZone;
  const days = lastDays(CHART_DAYS, tz);
  // Margen de un día extra para cubrir cualquier desfase de zona horaria; se filtra abajo.
  const since = new Date(Date.now() - (CHART_DAYS + 1) * DAY_MS);

  const rows = await prisma.$queryRaw<{ day: string; is_visit: boolean; count: number }[]>`
    SELECT to_char(e."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           (e."eventType" = 'page_view') AS is_visit,
           count(*)::int AS count
    FROM "Event" e
    JOIN "Profile" p ON p.id = e."profileId"
    WHERE e."timestamp" >= ${since} AND ${scope}
    GROUP BY 1, 2`;

  const byDay = new Map(days.map((day) => [day, { day, visits: 0, interactions: 0 }]));
  for (const row of rows) {
    const point = byDay.get(row.day);
    if (!point) continue;
    if (row.is_visit) point.visits += row.count;
    else point.interactions += row.count;
  }
  return [...byDay.values()];
}

export type TeamRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  memberName: string | null;
  scans: number;
  visits: number;
  whatsapp: number;
  contactSaves: number;
  leads: number;
  lastEventAt: Date | null;
  idle: boolean;
};

/**
 * Resumen de la empresa en los últimos 30 días: lo que el gerente compra.
 * Ranking por colaborador de tarjetas escaneadas, visitas, conversaciones de
 * WhatsApp iniciadas, contactos guardados y contactos recibidos.
 */
export async function getTeamOverview(ctx: OrgContext) {
  const since = new Date(Date.now() - CHART_DAYS * DAY_MS);
  const idleSince = Date.now() - IDLE_DAYS * DAY_MS;
  const profileFilter = profileWhere(ctx);
  const eventWhere = { organizationId: ctx.org.id, profile: profileFilter };

  const [profiles, totals, perProfile, lastEvents, leadsPerProfile, leadsTotal, activeSeats, daily] =
    await Promise.all([
      prisma.profile.findMany({
        where: profileFilter,
        orderBy: { name: "asc" },
        select: { id: true, slug: true, name: true, status: true, member: { select: { name: true } } },
      }),
      prisma.event.groupBy({
        by: ["eventType"],
        where: { ...eventWhere, timestamp: { gte: since } },
        _count: { _all: true },
      }),
      prisma.event.groupBy({
        by: ["profileId", "eventType"],
        where: { ...eventWhere, timestamp: { gte: since } },
        _count: { _all: true },
      }),
      prisma.event.groupBy({ by: ["profileId"], where: eventWhere, _max: { timestamp: true } }),
      prisma.lead.groupBy({
        by: ["profileId"],
        where: { ...leadWhere(ctx), createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.lead.count({ where: { ...leadWhere(ctx), createdAt: { gte: since } } }),
      prisma.profile.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
      dailySeries(sqlScope(ctx)),
    ]);

  const lastByProfile = new Map(lastEvents.map((r) => [r.profileId, r._max.timestamp]));
  const leadsByProfile = new Map(leadsPerProfile.map((r) => [r.profileId, r._count._all]));

  const rows: TeamRow[] = profiles.map((p) => {
    const counts = toCounts(perProfile.filter((r) => r.profileId === p.id));
    const lastEventAt = lastByProfile.get(p.id) ?? null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      memberName: p.member?.name ?? null,
      scans: counts.card_scan,
      visits: counts.page_view,
      whatsapp: counts.whatsapp_click,
      contactSaves: counts.contact_save,
      leads: leadsByProfile.get(p.id) ?? 0,
      lastEventAt,
      idle: p.status === "ACTIVE" && (!lastEventAt || lastEventAt.getTime() < idleSince),
    };
  });
  // Ranking: primero quien más conversaciones genera.
  rows.sort((a, b) => b.whatsapp + b.leads - (a.whatsapp + a.leads) || b.visits - a.visits);

  return {
    counts30: toCounts(totals),
    leads30: leadsTotal,
    activeSeats,
    daily,
    rows,
  };
}

/** Escaneos por tarjeta en los últimos 30 días. */
export async function getCardScans30(ctx: OrgContext): Promise<Map<string | null, number>> {
  const rows = await prisma.event.groupBy({
    by: ["cardId"],
    where: {
      organizationId: ctx.org.id,
      eventType: "card_scan",
      timestamp: { gte: new Date(Date.now() - CHART_DAYS * DAY_MS) },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

export async function getProfileStats(ctx: OrgContext, slug: string) {
  const profile = await prisma.profile.findFirst({
    where: { slug, ...profileWhere(ctx) },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      jobTitle: true,
      phone: true,
      whatsapp: true,
      email: true,
      publicUrl: true,
      memberUserId: true,
      createdAt: true,
      member: { select: { name: true, email: true } },
      cards: { orderBy: { createdAt: "asc" }, select: { id: true, code: true, label: true, status: true } },
    },
  });
  if (!profile) return null;

  const since30 = new Date(Date.now() - CHART_DAYS * DAY_MS);
  const where = { profileId: profile.id, organizationId: ctx.org.id };

  const [allTime, last30, visitorRows, scansByVia, devices, recent, leads30, daily] = await Promise.all([
    prisma.event.groupBy({ by: ["eventType"], where, _count: { _all: true } }),
    prisma.event.groupBy({
      by: ["eventType"],
      where: { ...where, timestamp: { gte: since30 } },
      _count: { _all: true },
    }),
    // Visitantes aproximados = identificadores anónimos distintos.
    prisma.$queryRaw<{ all_time: number; last_30: number }[]>`
      SELECT count(DISTINCT "anonymousSessionId")::int AS all_time,
             count(DISTINCT "anonymousSessionId") FILTER (WHERE "timestamp" >= ${since30})::int AS last_30
      FROM "Event" WHERE "profileId" = ${profile.id} AND "organizationId" = ${ctx.org.id}`,
    prisma.$queryRaw<{ via: string; count: number }[]>`
      SELECT coalesce(metadata->>'via', 'nfc') AS via, count(*)::int AS count
      FROM "Event"
      WHERE "profileId" = ${profile.id} AND "organizationId" = ${ctx.org.id}
        AND "eventType" = 'card_scan' AND "timestamp" >= ${since30}
      GROUP BY 1`,
    prisma.event.groupBy({ by: ["deviceType"], where, _count: { _all: true } }),
    prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 50,
      select: { id: true, eventType: true, timestamp: true, deviceType: true, referrer: true, metadata: true },
    }),
    prisma.lead.count({ where: { ...leadWhere(ctx), profileId: profile.id, createdAt: { gte: since30 } } }),
    dailySeries(Prisma.sql`e."organizationId" = ${ctx.org.id} AND p.id = ${profile.id}`),
  ]);

  const counts = toCounts(allTime);
  return {
    profile,
    counts,
    counts30: toCounts(last30),
    totalEvents: sum(counts),
    visitors: visitorRows[0]?.all_time ?? 0,
    visitors30: visitorRows[0]?.last_30 ?? 0,
    scans30: {
      nfc: scansByVia.find((r) => r.via === "nfc")?.count ?? 0,
      qr: scansByVia.find((r) => r.via === "qr")?.count ?? 0,
    },
    leads30,
    devices: devices
      .map((d) => ({ deviceType: d.deviceType, count: d._count._all }))
      .sort((a, b) => b.count - a.count),
    recent,
    daily,
  };
}
