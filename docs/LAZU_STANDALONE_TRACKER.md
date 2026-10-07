# LAZU Standalone Tracker

Guía para conectar **cualquier perfil HTML independiente** (por ejemplo `juan.html`, `barberia-lux.html`) con las estadísticas de LAZU.

El tracker es un bloque de JavaScript puro (sin frameworks, sin dependencias, ~4 KB) que se pega dentro del HTML. El perfil sigue siendo 100 % autónomo: su diseño, contenido e interacciones no dependen de LAZU. El único vínculo con la plataforma es el endpoint de tracking.

---

## 1. Instalación en 3 pasos

### Paso 1 · Registra el perfil en el dashboard

Entra al dashboard como administrador → **Nuevo perfil** → escribe el slug (`juan-perez`) y el nombre. El slug es el identificador público del perfil: solo minúsculas, números y guiones.

### Paso 2 · Pega el tracker antes de `</body>`

```html
<!-- ===== LAZU tracker · pegar antes de </body> ===== -->
<script>
  const LAZU_PROFILE_ID = "juan-perez";                      // slug del perfil
  const LAZU_ENDPOINT = "https://app.lazu.bio/api/track";    // en local: http://localhost:3000/api/track
  /* LAZU-TRACKER:START */
  /* …contenido completo de tracker/lazu-tracker.js… */
  /* LAZU-TRACKER:END */
</script>
<!-- ===== fin LAZU tracker ===== -->
```

El código del tracker está en [`tracker/lazu-tracker.js`](../tracker/lazu-tracker.js). Cópialo completo entre los marcadores. Si tienes el repositorio, puedes hacerlo automáticamente:

```bash
npm run tracker:sync -- ruta/a/juan.html
```

(El comando reemplaza lo que haya entre `LAZU-TRACKER:START` y `LAZU-TRACKER:END`, así que también sirve para actualizar perfiles a una versión nueva del tracker.)

### Paso 3 · Marca los botones con `data-lazu-event`

```html
<a href="https://wa.me/521234567890" data-lazu-event="whatsapp_click">WhatsApp</a>
<a href="tel:+521234567890"          data-lazu-event="phone_click">Llamar</a>
<a href="https://maps.app.goo.gl/x"  data-lazu-event="maps_click">Cómo llegar</a>
<a href="https://juanperez.com"      data-lazu-event="website_click">Sitio web</a>
<a href="https://instagram.com/juan" data-lazu-event="social_click" data-lazu-label="instagram">Instagram</a>
<button type="button"                data-lazu-event="contact_save">Guardar contacto</button>
<a href="#catalogo"                  data-lazu-event="catalog_view">Ver catálogo</a>
```

Listo. No hace falta escribir JavaScript: el tracker usa **delegación de eventos** (un único listener en `document`), así que funciona con cualquier estructura, con elementos que se agregan después y con elementos anidados (un clic en un `<span>` dentro del `<a>` también cuenta).

---

## 2. Qué registra automáticamente

| Evento | Cuándo |
|---|---|
| `page_view` | Al cargar la página (una vez). Incluye `document.referrer` para saber de dónde llegó la visita. |
| Cualquier `data-lazu-event` | Al hacer clic (o clic central) sobre el elemento o sobre algo dentro de él. |

En cada clic el tracker añade a `metadata`:

- `label`: el valor de `data-lazu-label`, si existe (útil para distinguir redes sociales).
- `target`: el dominio del enlace (`wa.me`, `instagram.com`) o `tel` / `mailto`. Nunca la URL completa.

### Eventos válidos

`page_view`, `whatsapp_click`, `phone_click`, `maps_click`, `social_click`, `website_click`, `contact_save`, `catalog_view`, `custom`.

El servidor rechaza cualquier otro tipo. Para agregar uno nuevo se añade a `lib/events.ts` y a la lista `EVENTS` de `tracker/lazu-tracker.js` (un test verifica que ambas listas coincidan).

---

## 3. API manual: `lazuTrack(eventName, metadata)`

El tracker expone `window.lazuTrack` para casos que no son un clic:

```js
// Un carrusel de catálogo que se abre con JavaScript propio
lazuTrack("catalog_view", { section: "cortes" });

// Cualquier interacción a medida
lazuTrack("custom", { action: "video_play", video: "promo-2026" });
```

Reglas de `metadata` (se aplican en el navegador y se vuelven a validar en el servidor):

- Objeto plano, máximo 20 claves.
- Claves: letras, números, `_`, `.`, `-` (máx. 40 caracteres).
- Valores: texto (se recorta a 200 caracteres y se le quitan `<` `>`), número, booleano o `null`. Nada de objetos anidados.
- **Nunca** pongas datos personales del visitante (nombre, email, teléfono).

### Desactivar el `page_view` automático

Si el perfil es una SPA o quieres controlarlo tú:

```html
<script>
  const LAZU_PROFILE_ID = "juan-perez";
  const LAZU_ENDPOINT = "https://app.lazu.bio/api/track";
  const LAZU_AUTO_PAGE_VIEW = false;
  /* …tracker… */
</script>
```

y luego llama `lazuTrack("page_view")` cuando corresponda.

---

## 4. Cómo se envían los eventos

1. **`navigator.sendBeacon()`** (preferido). El navegador garantiza el envío aunque el clic provoque una navegación (abrir WhatsApp, llamar, ir a Maps).
2. Si `sendBeacon` no existe o falla: **`fetch(..., { keepalive: true })`**, que también sobrevive a la navegación.

El cuerpo se envía como `text/plain` con JSON dentro. Así la petición es "simple" para CORS (sin preflight `OPTIONS`) y compatible con `sendBeacon`. El servidor lo interpreta como JSON igualmente.

Ejemplo del JSON enviado:

```json
{
  "profile": "juan-perez",
  "event": "whatsapp_click",
  "sessionId": "anon-5b6d9589faf14dd089b0d19462bacc80",
  "metadata": { "target": "wa.me" }
}
```

Errores de red o del servidor se ignoran en silencio: **el tracking nunca rompe el perfil**.

---

## 5. Identificador anónimo (`lazu_session_id`)

Para estimar "visitantes aproximados" el tracker guarda en `localStorage`:

```json
lazu_session_id = { "id": "anon-<32 caracteres hex aleatorios>", "exp": <timestamp> }
```

- Se genera en el navegador con `crypto.randomUUID()` (o `crypto.getRandomValues`). Es aleatorio: **no se deriva de nada del visitante**.
- Dura **30 días** desde su creación; después se genera uno nuevo. No se renueva con cada visita.
- No contiene nombres, emails, teléfonos ni ningún dato personal; LAZU no usa cookies en los perfiles.
- Es por dominio: el mismo visitante en `juan.lazu.bio` y en `maria.lazu.bio` tiene ids distintos, por lo que no permite seguir a una persona entre perfiles.
- Si el navegador envía **Global Privacy Control** o **Do Not Track**, o si `localStorage` está bloqueado, no se guarda nada: se usa un id nuevo en memoria por cada carga de página.

Por eso el dashboard habla de visitantes **aproximados**: borrar datos del navegador, usar otro dispositivo o el modo privado cuenta como visitante nuevo.

---

## 6. Requisitos del lado del servidor

- El **dominio del perfil debe estar en `ALLOWED_ORIGINS`** de la plataforma (p. ej. `https://barberialux.com` o `https://*.lazu.bio`). Si no, el servidor responde `403 origin_not_allowed` y no guarda nada.
- El perfil debe existir y estar **Activo** en el dashboard. Si está Inactivo o Suspendido, los eventos se rechazan.
- Límite: 60 eventos por minuto por IP (configurable con `TRACK_RATE_LIMIT_PER_MINUTE`).
- Bots y generadores de vista previa (Googlebot, WhatsApp al compartir el enlace, navegadores headless) reciben `success: true` pero no se cuentan.

---

## 7. Qué **no** debe ir nunca en el HTML

El HTML es público: cualquiera puede ver su código fuente. Por eso:

- ❌ API keys, tokens, contraseñas, `AUTH_SECRET`, `DATABASE_URL`.
- ✅ Solo `LAZU_PROFILE_ID` (público por diseño) y `LAZU_ENDPOINT`.

Alguien podría copiar el slug y enviar eventos falsos desde su propio servidor; el control de origen (CORS + verificación de `Origin` en el servidor), la validación estricta y el rate limiting reducen ese riesgo. Es el mismo modelo que usan Google Analytics o Plausible.

---

## 8. Probar en local

```bash
# Terminal 1: plataforma
npm run dev                       # http://localhost:3000

# Terminal 2: servir el perfil desde OTRO origen, como si fuera Hostinger
cd public && python3 -m http.server 5500   # o: npx serve -l 5500
```

Abre `http://localhost:5500/test-profile.html`, pulsa los botones y revisa el dashboard.

> **Nota:** abrir el HTML con doble clic (`file://…`) no sirve para probar: el navegador envía `Origin: null` y el servidor lo rechaza. Sírvelo siempre por `http://`.

Para depurar, abre DevTools → **Network** y filtra por `track`: cada evento aparece como una petición `ping`/`fetch` con respuesta `{"success":true}`.

---

## 9. Plantilla mínima completa

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Juan Pérez</title>
  <style>/* tu diseño, libre */</style>
</head>
<body>
  <h1>Juan Pérez</h1>
  <a href="https://wa.me/521234567890" data-lazu-event="whatsapp_click">Escríbeme</a>
  <a href="tel:+521234567890" data-lazu-event="phone_click">Llámame</a>

  <script>
    const LAZU_PROFILE_ID = "juan-perez";
    const LAZU_ENDPOINT = "https://app.lazu.bio/api/track";
    /* LAZU-TRACKER:START */
    /* pega aquí tracker/lazu-tracker.js */
    /* LAZU-TRACKER:END */
  </script>
</body>
</html>
```

Ejemplo real y funcional: [`public/test-profile.html`](../public/test-profile.html).
