import { z } from "zod";
import { EVENT_TYPES } from "./events";

export const MAX_BODY_BYTES = 4096;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_STRING = 200;
const METADATA_KEY_RE = /^[A-Za-z0-9_.-]{1,40}$/;

// Solo valores planos: nada de objetos anidados, funciones ni HTML.
const metadataValue = z.union([
  z.string().max(1000).transform((s) => sanitizeText(s).slice(0, MAX_METADATA_STRING)),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z
  .record(z.string().regex(METADATA_KEY_RE), metadataValue)
  .refine((obj) => Object.keys(obj).length <= MAX_METADATA_KEYS, {
    message: "too_many_metadata_keys",
  });

export const trackPayloadSchema = z.object({
  profile: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  event: z.enum(EVENT_TYPES),
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional()
    .nullable(),
  // document.referrer del navegador: de dónde llegó el visitante (se recorta en el servidor).
  referrer: z.string().max(2000).optional().nullable(),
  metadata: metadataSchema.optional().nullable(),
});

export type TrackPayload = z.infer<typeof trackPayloadSchema>;

export type ParseResult =
  | { ok: true; data: TrackPayload }
  | { ok: false; error: "payload_too_large" | "invalid_json" | "invalid_payload" };

/** Quita caracteres de control y los signos < > para que nada se interprete como HTML. */
export function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
}

export function parseTrackPayload(raw: string): ParseResult {
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, error: "payload_too_large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const result = trackPayloadSchema.safeParse(json);
  if (!result.success) return { ok: false, error: "invalid_payload" };
  return { ok: true, data: result.data };
}
