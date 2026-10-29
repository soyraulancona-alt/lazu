-- Fase 2: multiempresa (organizaciones, miembros, tarjetas, contactos, auditoría).
-- Conserva los datos existentes: cada dueño de perfiles recibe una organización
-- propia (plan INDIVIDUAL) y sus perfiles y eventos pasan a ella.

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "Plan" AS ENUM ('INDIVIDUAL', 'TEAM', 'ENTERPRISE');
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'WON', 'LOST');

-- UserRole: OWNER pasa a llamarse USER (rol de plataforma). Renombrar conserva los datos.
ALTER TYPE "UserRole" RENAME VALUE 'OWNER' TO 'USER';
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'TEAM',
    "seatLimit" INTEGER NOT NULL DEFAULT 5,
    "paidUntil" TIMESTAMP(3),
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "fallbackUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "label" VARCHAR(80),
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "profileId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(40),
    "email" VARCHAR(200),
    "company" VARCHAR(120),
    "message" VARCHAR(1000),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "action" VARCHAR(60) NOT NULL,
    "targetType" VARCHAR(40) NOT NULL,
    "targetId" VARCHAR(40),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Profile: el dueño pasa a ser el colaborador asignado; se agregan datos del colaborador.
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_ownerUserId_fkey";
DROP INDEX "Profile_ownerUserId_idx";
ALTER TABLE "Profile" RENAME COLUMN "ownerUserId" TO "memberUserId";
ALTER TABLE "Profile"
    ADD COLUMN "organizationId" TEXT,
    ADD COLUMN "jobTitle" VARCHAR(120),
    ADD COLUMN "phone" VARCHAR(40),
    ADD COLUMN "whatsapp" VARCHAR(40),
    ADD COLUMN "email" VARCHAR(200),
    ADD COLUMN "publicUrl" VARCHAR(500);

-- Datos existentes: una organización por cada usuario con perfiles.
INSERT INTO "Organization" ("id", "slug", "name", "plan", "seatLimit", "createdAt", "updatedAt")
SELECT 'org_' || u."id",
       'cuenta-' || substr(md5(u."id"), 1, 10),
       'Cuenta de ' || u."name",
       'INDIVIDUAL',
       GREATEST(1, count(p."id")::int),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "User" u
JOIN "Profile" p ON p."memberUserId" = u."id"
GROUP BY u."id", u."name";

INSERT INTO "Membership" ("id", "organizationId", "userId", "role")
SELECT 'mem_' || o."id", o."id", substr(o."id", 5), 'OWNER'
FROM "Organization" o;

UPDATE "Profile" SET "organizationId" = 'org_' || "memberUserId" WHERE "memberUserId" IS NOT NULL;

-- Perfiles sin dueño: van a una organización interna de LAZU.
INSERT INTO "Organization" ("id", "slug", "name", "plan", "seatLimit", "createdAt", "updatedAt")
SELECT 'org_lazu_internal', 'lazu-interno', 'LAZU (perfiles sin dueño)', 'TEAM',
       GREATEST(1, count(*)::int), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Profile" WHERE "organizationId" IS NULL
HAVING count(*) > 0;

UPDATE "Profile" SET "organizationId" = 'org_lazu_internal' WHERE "organizationId" IS NULL;

ALTER TABLE "Profile" ALTER COLUMN "organizationId" SET NOT NULL;

-- Event: copia de la organización del perfil para consultas por empresa sin JOIN.
ALTER TABLE "Event" ADD COLUMN "organizationId" TEXT, ADD COLUMN "cardId" TEXT;
UPDATE "Event" e SET "organizationId" = p."organizationId" FROM "Profile" p WHERE p."id" = e."profileId";
ALTER TABLE "Event" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");
CREATE UNIQUE INDEX "Card_code_key" ON "Card"("code");
CREATE INDEX "Card_organizationId_idx" ON "Card"("organizationId");
CREATE INDEX "Card_profileId_idx" ON "Card"("profileId");
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");
CREATE INDEX "Lead_profileId_createdAt_idx" ON "Lead"("profileId", "createdAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "Event_organizationId_timestamp_idx" ON "Event"("organizationId", "timestamp");
CREATE INDEX "Event_organizationId_eventType_timestamp_idx" ON "Event"("organizationId", "eventType", "timestamp");
CREATE INDEX "Event_cardId_idx" ON "Event"("cardId");
CREATE INDEX "Profile_organizationId_idx" ON "Profile"("organizationId");
CREATE INDEX "Profile_memberUserId_idx" ON "Profile"("memberUserId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
