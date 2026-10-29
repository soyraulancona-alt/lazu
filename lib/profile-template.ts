// Plantillas de perfil por empresa. Una plantilla es un HTML independiente,
// diseñado a mano o con scripts/design-profile.ts, con marcadores que se llenan
// con los datos de cada colaborador. El resultado sigue siendo un HTML autónomo:
// la plataforma nunca lo renderiza.
//
// Marcadores:
//   {{campo}}            texto escapado para HTML
//   {{campo|url}}        codificado para usar dentro de una URL (wa.me, tel:, mailto:)
//   {{campo|js}}         cadena JSON segura dentro de <script>
//   {{#campo}}…{{/campo}} bloque que solo aparece si el campo tiene valor
// Campos: slug, name, initials, jobTitle, company, phone, phoneDigits, whatsapp,
//         email, publicUrl

export const TRACKER_START = "/* LAZU-TRACKER:START */";
export const TRACKER_END = "/* LAZU-TRACKER:END */";

export type ProfileData = {
  slug: string;
  name: string;
  jobTitle?: string | null;
  company?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  publicUrl?: string | null;
};

export const TEMPLATE_FIELDS = [
  "slug",
  "name",
  "initials",
  "jobTitle",
  "company",
  "phone",
  "phoneDigits",
  "whatsapp",
  "email",
  "publicUrl",
] as const;
type Field = (typeof TEMPLATE_FIELDS)[number];

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

function jsString(value: string): string {
  // JSON + escapar < > & para que nada cierre el <script> ni abra HTML.
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function fieldValues(data: ProfileData): Record<Field, string> {
  const initials = data.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return {
    slug: data.slug,
    name: data.name,
    initials,
    jobTitle: data.jobTitle ?? "",
    company: data.company ?? "",
    phone: data.phone ?? "",
    phoneDigits: (data.phone ?? "").replace(/[^\d+]/g, ""),
    whatsapp: (data.whatsapp ?? "").replace(/\D/g, ""),
    email: data.email ?? "",
    publicUrl: data.publicUrl ?? "",
  };
}

export type TemplateIssue = string;

/**
 * Revisa que una plantilla cumpla el contrato de LAZU antes de usarla.
 * Devuelve la lista de problemas (vacía si está bien).
 */
export function validateTemplate(html: string): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const start = html.indexOf(TRACKER_START);
  const end = html.indexOf(TRACKER_END);
  if (start === -1 || end < start) issues.push("Falta el bloque del tracker (LAZU-TRACKER:START / END).");
  if (!/const\s+LAZU_PROFILE_ID\s*=\s*"\{\{slug\}\}"/.test(html)) {
    issues.push('Falta `const LAZU_PROFILE_ID = "{{slug}}";` antes del tracker.');
  }
  // Fuera del bloque del tracker, que se reemplaza siempre por la versión oficial.
  const outside = start !== -1 && end > start ? html.slice(0, start) + html.slice(end) : html;
  if (/<script[^>]+src\s*=/i.test(outside)) issues.push("No se permiten scripts externos (<script src>).");
  if (/<link[^>]+rel\s*=\s*["']?stylesheet/i.test(outside)) issues.push("No se permiten hojas de estilo externas.");
  if (/<iframe|<object|<embed/i.test(outside)) issues.push("No se permiten iframes, object ni embed.");
  if (/<form[^>]+action\s*=/i.test(outside)) issues.push("Los formularios no pueden enviar a otros sitios (atributo action).");
  if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\beval\s*\(|new\s+Function/i.test(outside)) {
    issues.push("El HTML no puede hacer peticiones de red ni ejecutar código dinámico fuera del tracker.");
  }
  if (/\bon[a-z]+\s*=\s*["']/i.test(outside)) issues.push("No se permiten atributos on* (onclick, onload…); usa addEventListener.");
  if (/AUTH_SECRET|DATABASE_URL|api[_-]?key|password/i.test(outside)) issues.push("La plantilla no debe contener secretos.");
  const unknown = [...html.matchAll(/\{\{[#/]?([a-zA-Z]+)(?:\|[a-z]+)?\}\}/g)]
    .map((m) => m[1]!)
    .filter((f) => !(TEMPLATE_FIELDS as readonly string[]).includes(f));
  if (unknown.length) issues.push(`Marcadores desconocidos: ${[...new Set(unknown)].join(", ")}.`);
  return issues;
}

/** Reemplaza lo que haya entre los marcadores por el tracker oficial. */
export function embedTracker(html: string, trackerSource: string): string {
  const start = html.indexOf(TRACKER_START);
  const end = html.indexOf(TRACKER_END);
  if (start === -1 || end < start) throw new Error("La plantilla no tiene el bloque LAZU-TRACKER.");
  return `${html.slice(0, start + TRACKER_START.length)}\n${trackerSource.trim()}\n${html.slice(end)}`;
}

/** Llena la plantilla con los datos de un colaborador. */
export function renderProfile(template: string, data: ProfileData, trackerSource: string): string {
  const values = fieldValues(data);
  let html = template.replace(/\{\{#([a-zA-Z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, field: string, inner: string) =>
    values[field as Field] ? inner : "",
  );
  html = html.replace(/\{\{([a-zA-Z]+)(?:\|(url|js))?\}\}/g, (_m, field: string, mode?: string) => {
    const value = values[field as Field] ?? "";
    if (mode === "url") return encodeURIComponent(value);
    if (mode === "js") return jsString(value);
    return escapeHtml(value);
  });
  return embedTracker(html, trackerSource);
}
