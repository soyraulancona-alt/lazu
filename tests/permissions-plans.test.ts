import assert from "node:assert/strict";
import { test } from "node:test";
import { can, canAssignRole } from "../lib/permissions";
import { planAccess, PLAN_FEATURES, seatsAvailable } from "../lib/plans";

test("los colaboradores no administran ni ven datos del equipo", () => {
  for (const action of ["stats.team", "profiles.manage", "members.manage", "cards.manage", "leads.viewAll", "leads.export"] as const) {
    assert.equal(can("MEMBER", action), false, action);
    assert.equal(can("ADMIN", action), true, action);
    assert.equal(can("OWNER", action), true, action);
  }
  assert.equal(can("MEMBER", "org.view"), true);
});

test("solo los propietarios tocan a otros propietarios y la configuración de la empresa", () => {
  assert.equal(can("ADMIN", "members.manageOwners"), false);
  assert.equal(can("OWNER", "members.manageOwners"), true);
  assert.equal(can("ADMIN", "org.settings"), false);
  assert.equal(canAssignRole("ADMIN", "MEMBER", null), true);
  assert.equal(canAssignRole("ADMIN", "OWNER", null), false, "un admin no puede crear propietarios");
  assert.equal(canAssignRole("ADMIN", "MEMBER", "OWNER"), false, "un admin no puede degradar a un propietario");
  assert.equal(canAssignRole("OWNER", "MEMBER", "OWNER"), true);
  assert.equal(canAssignRole("MEMBER", "MEMBER", null), false);
});

test("el cobro lo administra solo el personal de LAZU", () => {
  assert.equal(can("OWNER", "billing.manage"), false);
  assert.equal(can("OWNER", "billing.manage", true), true);
});

test("con la vigencia vencida se bloquean las funciones de pago, sin perder el plan", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const lapsed = planAccess({ plan: "TEAM", paidUntil: new Date("2026-10-28T23:59:59Z") }, now);
  assert.equal(lapsed.current, false);
  assert.equal(lapsed.plan, "TEAM");
  assert.deepEqual(Object.values(lapsed.features), [false, false, false, false, false]);

  const current = planAccess({ plan: "TEAM", paidUntil: new Date("2026-10-29T23:59:59Z") }, now);
  assert.equal(current.current, true);
  assert.deepEqual(current.features, PLAN_FEATURES.TEAM);

  assert.equal(planAccess({ plan: "INDIVIDUAL", paidUntil: null }, now).current, true, "sin fecha = piloto vigente");
});

test("el ranking del equipo y el CSV son de los planes Equipo y Empresa", () => {
  assert.equal(PLAN_FEATURES.INDIVIDUAL.teamStats, false);
  assert.equal(PLAN_FEATURES.INDIVIDUAL.leadsExport, false);
  assert.equal(PLAN_FEATURES.TEAM.teamStats, true);
  assert.equal(PLAN_FEATURES.ENTERPRISE.auditLog, true);
  assert.equal(seatsAvailable(5, 3), 2);
  assert.equal(seatsAvailable(5, 7), 0);
});
