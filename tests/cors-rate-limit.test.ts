import assert from "node:assert/strict";
import { test } from "node:test";
import { corsHeaders, isOriginAllowed, parseAllowedOrigins } from "../lib/cors";
import { clientIp, createRateLimiter } from "../lib/rate-limit";
import { detectDeviceType, isBot } from "../lib/user-agent";

const allowed = parseAllowedOrigins("https://lazu.bio/, https://*.lazu.bio,https://BarberiaLux.com");

test("parseAllowedOrigins normaliza la lista", () => {
  assert.deepEqual(allowed, ["https://lazu.bio", "https://*.lazu.bio", "https://barberialux.com"]);
});

test("acepta orígenes exactos y subdominios con comodín", () => {
  assert.equal(isOriginAllowed("https://lazu.bio", allowed, false), true);
  assert.equal(isOriginAllowed("https://juan.lazu.bio", allowed, false), true);
  assert.equal(isOriginAllowed("https://barberialux.com", allowed, false), true);
});

test("rechaza orígenes parecidos o ausentes", () => {
  for (const origin of [
    "https://lazu.bio.evil.com",
    "https://evil-lazu.bio",
    "http://juan.lazu.bio",
    "https://evil.com",
    "null",
  ]) {
    assert.equal(isOriginAllowed(origin, allowed, false), false, origin);
  }
  assert.equal(isOriginAllowed(null, allowed, false), false);
});

test("localhost solo se acepta en desarrollo", () => {
  assert.equal(isOriginAllowed("http://localhost:5500", [], true), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:8080", [], true), true);
  assert.equal(isOriginAllowed("http://localhost:5500", [], false), false);
  assert.equal(isOriginAllowed("http://localhost.evil.com", [], true), false);
});

test("corsHeaders devuelve el origen concreto, nunca *", () => {
  const h = corsHeaders("https://juan.lazu.bio");
  assert.equal(h["Access-Control-Allow-Origin"], "https://juan.lazu.bio");
  assert.equal(h.Vary, "Origin");
});

test("rate limiter bloquea al superar el límite y se reinicia", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
  const t = 1_000_000;
  assert.equal(limiter.check("ip", t).allowed, true);
  assert.equal(limiter.check("ip", t).allowed, true);
  assert.equal(limiter.check("ip", t).allowed, true);
  assert.equal(limiter.check("ip", t).allowed, false);
  assert.equal(limiter.check("otra-ip", t).allowed, true);
  assert.equal(limiter.check("ip", t + 1001).allowed, true);
});

test("clientIp usa la primera IP de x-forwarded-for", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("detecta dispositivo y bots", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  assert.equal(detectDeviceType(iphone), "mobile");
  assert.equal(detectDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(detectDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "desktop");
  assert.equal(detectDeviceType(null), "unknown");
  assert.equal(isBot("Googlebot/2.1"), true);
  assert.equal(isBot("WhatsApp/2.23.20.0"), true);
  assert.equal(isBot(iphone), false);
});
