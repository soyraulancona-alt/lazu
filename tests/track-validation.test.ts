import assert from "node:assert/strict";
import { test } from "node:test";
import { isEventType } from "../lib/events";
import { sanitizeReferrer } from "../lib/referrer";
import { MAX_BODY_BYTES, parseTrackPayload } from "../lib/track-validation";

const valid = { profile: "juan-perez", event: "page_view", sessionId: "anon-abc12345", metadata: {} };

test("acepta un payload válido", () => {
  const r = parseTrackPayload(JSON.stringify(valid));
  assert.equal(r.ok, true);
});

test("normaliza el slug a minúsculas", () => {
  const r = parseTrackPayload(JSON.stringify({ ...valid, profile: "Juan-Perez" }));
  assert.ok(r.ok && r.data.profile === "juan-perez");
});

test("rechaza JSON inválido", () => {
  assert.deepEqual(parseTrackPayload("{no json"), { ok: false, error: "invalid_json" });
});

test("rechaza tipos de evento desconocidos", () => {
  const r = parseTrackPayload(JSON.stringify({ ...valid, event: "drop_table" }));
  assert.deepEqual(r, { ok: false, error: "invalid_payload" });
  assert.equal(isEventType("whatsapp_click"), true);
  assert.equal(isEventType("__proto__"), false);
});

test("rechaza slugs con caracteres peligrosos", () => {
  for (const profile of ["../admin", "juan perez", "<script>", "", "-juan", "a".repeat(80)]) {
    assert.equal(parseTrackPayload(JSON.stringify({ ...valid, profile })).ok, false, profile);
  }
});

test("rechaza sessionId con formato no permitido", () => {
  assert.equal(parseTrackPayload(JSON.stringify({ ...valid, sessionId: "juan@correo.com" })).ok, false);
  assert.equal(parseTrackPayload(JSON.stringify({ ...valid, sessionId: undefined })).ok, true);
});

test("metadata: solo valores planos y claves seguras", () => {
  assert.equal(parseTrackPayload(JSON.stringify({ ...valid, metadata: { a: { b: 1 } } })).ok, false);
  assert.equal(parseTrackPayload(JSON.stringify({ ...valid, metadata: { "bad key": 1 } })).ok, false);
  const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
  assert.equal(parseTrackPayload(JSON.stringify({ ...valid, metadata: many })).ok, false);
});

test("metadata: limpia HTML y recorta textos largos", () => {
  const r = parseTrackPayload(
    JSON.stringify({ ...valid, metadata: { label: "<img src=x onerror=alert(1)>", long: "x".repeat(500) } }),
  );
  assert.ok(r.ok);
  assert.equal(r.data.metadata?.label, "img src=x onerror=alert(1)");
  assert.equal(String(r.data.metadata?.long).length, 200);
});

test("rechaza cuerpos demasiado grandes", () => {
  const body = JSON.stringify({ ...valid, metadata: { a: "x".repeat(MAX_BODY_BYTES) } });
  assert.deepEqual(parseTrackPayload(body), { ok: false, error: "payload_too_large" });
});

test("sanitizeReferrer quita query string y protocolos no http", () => {
  assert.equal(
    sanitizeReferrer("https://www.google.com/search?q=juan+perez&email=a@b.com#x"),
    "https://www.google.com/search",
  );
  assert.equal(sanitizeReferrer("javascript:alert(1)"), null);
  assert.equal(sanitizeReferrer("no es url"), null);
  assert.equal(sanitizeReferrer(""), null);
});
