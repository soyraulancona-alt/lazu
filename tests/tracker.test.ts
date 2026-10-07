import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EVENT_TYPES } from "../lib/events";

const tracker = readFileSync(new URL("../tracker/lazu-tracker.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/test-profile.html", import.meta.url), "utf8");

const squash = (s: string) => s.replace(/\s+/g, "");

test("test-profile.html contiene la versión actual del tracker (npm run tracker:sync)", () => {
  const start = html.indexOf("/* LAZU-TRACKER:START */");
  const end = html.indexOf("/* LAZU-TRACKER:END */");
  assert.ok(start > -1 && end > start);
  assert.equal(squash(html.slice(start + "/* LAZU-TRACKER:START */".length, end)), squash(tracker));
});

test("el tracker conoce exactamente los mismos eventos que el servidor", () => {
  const list = tracker.match(/var EVENTS = \[([\s\S]*?)\];/);
  assert.ok(list);
  const events = [...list[1]!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(events, [...EVENT_TYPES]);
});

test("el HTML de prueba no contiene secretos ni depende del dashboard", () => {
  assert.doesNotMatch(html, /AUTH_SECRET|DATABASE_URL|password|api[_-]?key|token/i);
  assert.match(html, /const LAZU_PROFILE_ID = "test-profile";/);
  assert.doesNotMatch(html, /<script[^>]+src=/i, "no debe cargar scripts externos");
  assert.doesNotMatch(html, /<link[^>]+stylesheet/i, "no debe cargar CSS externo");
});

test("el HTML de prueba marca los botones requeridos", () => {
  for (const event of ["whatsapp_click", "phone_click", "maps_click", "website_click", "contact_save"]) {
    assert.match(html, new RegExp(`data-lazu-event="${event}"`), event);
  }
});
