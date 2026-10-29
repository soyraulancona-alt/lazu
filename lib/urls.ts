import { z } from "zod";

/** URL pública http(s) válida o vacío. Se usa para publicUrl y fallbackUrl. */
export const publicUrlSchema = z.union([
  z.literal("").transform(() => null),
  z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((v) => /^https?:\/\//i.test(v), "url_scheme"),
]);

/** true solo para http(s): evita redirigir a javascript:, data:, etc. aunque algo raro llegue a la BD. */
export function isSafeRedirectUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
