import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { profileScope, type CurrentUser } from "./auth";
import { config } from "./config";
import { prisma } from "./db";
import { EVENT_TYPES, type EventType } from "./events";

export const CHART_DAYS = 30;

export type DailyPoint = { day: string; visits: number; interactions: number };
export type EventCounts = Record<EventType, number>;

function emptyCounts(): EventCounts {
  return Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as EventCounts;
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

/** Serie diaria (visitas vs. interacciones) para los perfiles indicados. */
async function dailySeries(profileFilter: Prisma.Sql): Promise<DailyPoint[]> {
  const tz = config.dashboardTimeZone;
  const days = lastDays(CHART_DAYS, tz);
  // Margen de un día extra para cubrir cualquier desfase de zona horaria; se filtra abajo.
  const since = new Date(Date.now() - (CHART_DAYS + 1) * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<{ day: string; is_visit: boolean; count: number }[]>`
    SELECT to_char(e."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           (e."eventType" = 'page_view') AS is_visit,
           count(*)::int AS count
    FROM "Event" e
    JOIN "Profile" p ON p.id = e."profileId"
    WHERE e."timestamp" >= ${since} AND ${profileFilter}
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

function sqlScope(user: CurrentUser): Prisma.Sql {
  return user.role === "ADMIN" ? Prisma.sql`TRUE` : Prisma.sql`p."ownerUserId" = ${user.id}`;
}

export async function getOverview(user: CurrentUser) {
  const scope = profileScope(user);

  const [profiles, totals, perProfile, lastEvents, daily] = await Promise.all([
    prisma.profile.findMany({
      where: scope,
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, status: true, createdAt: true },
    }),
    prisma.event.groupBy({
      by: ["eventType"],
      where: { profile: scope },
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ["profileId", "eventType"],
      where: { profile: scope },
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ["profileId"],
      where: { profile: scope },
      _max: { timestamp: true },
    }),
    dailySeries(sqlScope(user)),
  ]);

  const counts = toCounts(totals);
  const lastByProfile = new Map(lastEvents.map((r) => [r.profileId, r._max.timestamp]));

  return {
    activeProfiles: profiles.filter((p) => p.status === "ACTIVE").length,
    totalEvents: sum(counts),
    counts,
    daily,
    profiles: profiles.map((p) => {
      const rows = perProfile.filter((r) => r.profileId === p.id);
      const visits = rows.find((r) => r.eventType === "page_view")?._count._all ?? 0;
      const events = rows.reduce((a, r) => a + r._count._all, 0);
      return { ...p, visits, interactions: events - visits, lastEventAt: lastByProfile.get(p.id) ?? null };
    }),
  };
}

export async function getProfileStats(user: CurrentUser, slug: string) {
  const profile = await prisma.profile.findFirst({
    where: { slug, ...profileScope(user) },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!profile) return null;

  const since30 = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000);
  const where = { profileId: profile.id };

  const [allTime, last30, visitorRows, devices, recent, daily] = await Promise.all([
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
      FROM "Event" WHERE "profileId" = ${profile.id}`,
    prisma.event.groupBy({ by: ["deviceType"], where, _count: { _all: true } }),
    prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 50,
      select: {
        id: true,
        eventType: true,
        timestamp: true,
        deviceType: true,
        referrer: true,
        metadata: true,
      },
    }),
    dailySeries(Prisma.sql`p.id = ${profile.id}`),
  ]);

  const counts = toCounts(allTime);
  return {
    profile,
    counts,
    counts30: toCounts(last30),
    totalEvents: sum(counts),
    visitors: visitorRows[0]?.all_time ?? 0,
    visitors30: visitorRows[0]?.last_30 ?? 0,
    devices: devices
      .map((d) => ({ deviceType: d.deviceType, count: d._count._all }))
      .sort((a, b) => b.count - a.count),
    recent,
    daily,
  };
}
