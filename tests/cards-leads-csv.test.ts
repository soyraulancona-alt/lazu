import assert from "node:assert/strict";
import { test } from "node:test";
import { cardUrls, generateCardCode, isCardCode } from "../lib/card-code";
import { csvCell, toCsv } from "../lib/csv";
import { parseLeadPayload } from "../lib/lead-validation";
import { isSafeRedirectUrl, publicUrlSchema } from "../lib/urls";

test("los códigos de tarjeta son aleatorios, sin caracteres ambiguos", () => {
  const codes = new Set(Array.from({ length: 2000 }, generateCardCode));
  assert.equal(codes.size, 2000);
  for (const code of codes) assert.ok(isCardCode(code), code);
  assert.equal(isCardCode("abc0l1io"), false);
  assert.equal(isCardCode("../admin"), false);
  assert.deepEqual(cardUrls("https://app.lazu.bio/", "abcd2345"), {
    nfc: "https://app.lazu.bio/c/abcd2345",
    qr: "https://app.lazu.bio/c/abcd2345?v=qr",
  });
});

test("solo se redirige a URLs http(s)", () => {
  assert.equal(isSafeRedirectUrl("https://empresa.com/ana.html"), true);
  assert.equal(isSafeRedirectUrl("javascript:alert(1)"), false);
  assert.equal(isSafeRedirectUrl("data:text/html,hola"), false);
  assert.equal(isSafeRedirectUrl(null), false);
  assert.equal(publicUrlSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(publicUrlSchema.parse(""), null);
});

const validLead = { profile: "ana-torres", name: "Luis Pérez", phone: "+52 55 1234 5678", consent: true };

test("un contacto válido necesita nombre, teléfono o correo y consentimiento explícito", () => {
  const ok = parseLeadPayload(JSON.stringify(validLead));
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.data.email, null);
  assert.equal(ok.ok && ok.isSpam, false);

  for (const bad of [
    { ...validLead, consent: false },
    { ...validLead, consent: "true" },
    { ...validLead, phone: "", email: "" },
    { ...validLead, name: "L" },
    { ...validLead, email: "no-es-correo" },
    { ...validLead, phone: "<script>" },
    { ...validLead, profile: "../x" },
  ]) {
    assert.equal(parseLeadPayload(JSON.stringify(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseLeadPayload("{no json").ok, false);
  assert.equal(parseLeadPayload(JSON.stringify({ ...validLead, message: "x".repeat(5000) })).ok, false);
});

test("los textos del contacto se limpian y el campo trampa marca spam", () => {
  const r = parseLeadPayload(JSON.stringify({ ...validLead, name: "Luis <b>Pérez</b>", website: "http://spam" }));
  assert.ok(r.ok);
  assert.equal(r.ok && r.data.name, "Luis bPérez/b");
  assert.equal(r.ok && r.isSpam, true);
});

test("el CSV escapa comillas y neutraliza fórmulas de Excel", () => {
  assert.equal(csvCell('Dice "hola", adiós'), '"Dice ""hola"", adiós"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+5215512345678"), "'+5215512345678");
  assert.equal(csvCell(null), "");
  assert.ok(toCsv(["a"], [["b"]]).startsWith("﻿a\r\nb"));
});
