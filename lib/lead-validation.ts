import { z } from "zod";
import { MAX_BODY_BYTES, sanitizeText } from "./track-validation";

// Versión del texto de consentimiento que muestra el formulario del perfil.
// Si cambia el aviso de privacidad, se sube la versión para saber qué aceptó cada contacto.
export const DEFAULT_CONSENT_VERSION = "2026-10";

const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => sanitizeText(s).slice(0, max));

const optionalText = (max: number) =>
  text(max)
    .nullish()
    .transform((s) => s || null);

export const leadPayloadSchema = z
  .object({
    profile: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
    name: text(120).refine((s) => s.length >= 2, "name_required"),
    phone: optionalText(40).refine((s) => !s || /^[0-9+()\s.-]{6,40}$/.test(s), "phone_invalid"),
    email: optionalText(200).refine((s) => !s || z.email().safeParse(s).success, "email_invalid"),
    company: optionalText(120),
    message: optionalText(1000),
    // El visitante debe marcar la casilla de forma explícita.
    consent: z.literal(true),
    consentVersion: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,40}$/)
      .optional(),
    // Campo trampa invisible: las personas lo dejan vacío, los bots lo llenan.
    website: z.string().max(200).optional(),
  })
  .refine((d) => d.phone || d.email, { message: "contact_required", path: ["phone"] });

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

export type LeadParseResult =
  | { ok: true; data: LeadPayload; isSpam: boolean }
  | { ok: false; error: "payload_too_large" | "invalid_json" | "invalid_payload" };

export function parseLeadPayload(raw: string): LeadParseResult {
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, error: "payload_too_large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const result = leadPayloadSchema.safeParse(json);
  if (!result.success) return { ok: false, error: "invalid_payload" };
  return { ok: true, data: result.data, isSpam: !!result.data.website?.trim() };
}
