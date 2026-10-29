// Diseña con Claude la plantilla HTML de perfil de una empresa a partir de su descripción.
// Uso: npm run profile:design -- <descripcion.txt> <plantilla-salida.html> [--preview <carpeta>]
//   <descripcion.txt>  qué hace el negocio, a quién le vende, tono, colores, logo (URL), etc.
//   --preview          además genera un perfil de ejemplo para revisarlo en el navegador
// Requiere ANTHROPIC_API_KEY (o un perfil de `ant auth login`).
//
// El resultado es un borrador: revísalo y ajústalo antes de usarlo con clientes.
// Después, genera los perfiles del equipo con `npm run profiles:generate`.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderProfile, TEMPLATE_FIELDS, validateTemplate } from "../lib/profile-template";

const MODEL = "claude-opus-5-5";

const SYSTEM = `Eres el diseñador de LAZU, una plataforma de tarjetas digitales para equipos comerciales en México.
Diseñas la plantilla del perfil digital que verá un cliente potencial al escanear la tarjeta NFC o el QR de un vendedor.

Entrega UN archivo HTML completo y autónomo, y nada más (sin explicaciones, sin bloque de código).

Contrato obligatorio:
- Todo el CSS en un <style> interno. Sin scripts externos, sin hojas de estilo externas, sin fuentes externas, sin iframes.
- Sin atributos on* (onclick…): si necesitas JavaScript, usa addEventListener en un <script> interno.
- Ningún JavaScript propio puede hacer peticiones de red (fetch, XMLHttpRequest, sendBeacon) ni usar eval.
- Diseño móvil primero (360 px de ancho), carga instantánea, contraste AA, textos en español de México.
- Usa estos marcadores para los datos del colaborador, nunca datos inventados:
  {{name}} {{initials}} {{jobTitle}} {{company}} {{phone}} {{email}} {{publicUrl}}
  {{whatsapp|url}} dentro de https://wa.me/ (solo dígitos), {{phoneDigits|url}} dentro de tel:, {{email|url}} dentro de mailto:,
  {{campo|js}} dentro de <script> (ya incluye comillas).
  Envuelve en {{#campo}}…{{/campo}} lo que dependa de un dato opcional (jobTitle, phone, whatsapp, email).
- Botón principal, grande y arriba: "Escríbeme por WhatsApp", con mensaje prellenado amable en la URL de wa.me,
  marcado con data-lazu-event="whatsapp_click".
- Botón "Guardar contacto" con data-lazu-event="contact_save" que genera una vCard en el navegador
  (Blob + descarga) con nombre, puesto, empresa, teléfono, correo y URL.
- Enlace para llamar con data-lazu-event="phone_click"; enlace de correo con data-lazu-event="custom" data-lazu-label="email".
- Un formulario secundario más abajo: <form data-lazu-lead data-lazu-consent-version="2026-10"> con inputs name (required),
  phone, email, message, un campo trampa <input name="website"> oculto fuera de pantalla con tabindex="-1",
  y una casilla <input type="checkbox" name="consent" required> con el texto de consentimiento para ser contactado
  según el aviso de privacidad de la empresa. Sin atributo action. Muestra mensajes según el atributo
  data-lazu-state del form ("sending", "sent", "error") solo con CSS.
- Justo antes de </body>, exactamente este bloque:
<script>
  const LAZU_PROFILE_ID = "{{slug}}";
  const LAZU_ENDPOINT = "https://app.lazu.bio/api/track";
  /* LAZU-TRACKER:START */
  /* LAZU-TRACKER:END */
</script>

Diseña algo que se sienta hecho a la medida de la marca descrita, no una plantilla genérica.`;

function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const html = (fenced ? fenced[1]! : text).trim();
  const start = html.search(/<!doctype html/i);
  return start > 0 ? html.slice(start) : html;
}

async function main() {
  const args = process.argv.slice(2);
  const previewFlag = args.indexOf("--preview");
  const previewDir = previewFlag >= 0 ? args.splice(previewFlag, 2)[1] : undefined;
  const [briefPath, outPath] = args;
  if (!briefPath || !outPath) {
    console.error("Uso: npm run profile:design -- <descripcion.txt> <plantilla-salida.html> [--preview <carpeta>]");
    process.exit(1);
  }
  const brief = readFileSync(briefPath, "utf8").trim();
  if (brief.length < 40) {
    console.error("La descripción es muy corta: cuenta qué vende el negocio, a quién, su tono y sus colores.");
    process.exit(1);
  }

  const client = new Anthropic();
  console.log(`Diseñando con ${MODEL}…`);
  const message = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: "high" },
      // Si el modelo declina la petición, la API la reintenta con un modelo alternativo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Descripción del negocio:\n\n${brief}` }],
    })
    .finalMessage();

  if (message.stop_reason === "refusal") {
    console.error("El modelo no pudo atender esta descripción. Revísala y vuelve a intentarlo.");
    process.exit(1);
  }
  if (message.stop_reason === "max_tokens") {
    console.error("La respuesta se cortó por longitud. Pide un diseño más sencillo.");
    process.exit(1);
  }
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const template = extractHtml(text);

  writeFileSync(outPath, template);
  const issues = validateTemplate(template);
  if (issues.length) {
    console.error(`Plantilla guardada en ${outPath}, pero hay que corregirla antes de usarla:\n- ${issues.join("\n- ")}`);
    process.exit(2);
  }
  console.log(`✔ Plantilla en ${outPath}. Marcadores disponibles: ${TEMPLATE_FIELDS.join(", ")}.`);

  if (previewDir) {
    const tracker = readFileSync(new URL("../tracker/lazu-tracker.js", import.meta.url), "utf8");
    mkdirSync(previewDir, { recursive: true });
    const file = join(previewDir, "ejemplo.html");
    writeFileSync(
      file,
      renderProfile(
        template,
        {
          slug: "ejemplo",
          name: "Ana Torres",
          jobTitle: "Asesora comercial",
          company: "Empresa de ejemplo",
          phone: "+52 55 1234 5678",
          whatsapp: "5215512345678",
          email: "ana@ejemplo.com",
          publicUrl: "https://ejemplo.lazu.bio/ana.html",
        },
        tracker,
      ),
    );
    console.log(`✔ Vista previa en ${file}`);
  }
}

main().catch((error) => {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Falta ANTHROPIC_API_KEY o no es válida.");
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Límite de uso de la API alcanzado; espera un momento y reintenta.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Error de la API (${error.status}): ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
