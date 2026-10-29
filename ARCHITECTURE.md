# Arquitectura de LAZU

## Idea central

LAZU **no es un CMS**. Cada perfil digital es un archivo HTML independiente y autónomo (`juan.html`, `barberia-lux.html`) con su propio HTML, CSS, JavaScript, contenido y diseño. Dos perfiles pueden no parecerse en nada.

La plataforma central (este repositorio) **nunca renderiza perfiles**. Solo:

1. Identifica cada perfil (slug público) y la empresa a la que pertenece.
2. Recibe eventos y contactos (con consentimiento) de los perfiles.
3. Redirige las tarjetas físicas (`/c/<código>`) al perfil asignado en ese momento.
4. Guarda estadísticas y las muestra por empresa y por colaborador.
5. Administra empresas, miembros, roles, perfiles, tarjetas y plan contratado.

Los perfiles de un equipo se generan como HTML estáticos a partir de una plantilla por empresa (`scripts/generate-profiles.ts`); el resultado sigue siendo un archivo autónomo.

```
                 ┌───────────────────────────────┐
                 │  Hostinger / cualquier hosting│
                 │                               │
  Visitante ───▶ │  juan.html   maria.html  ...  │   HTML autónomo, diseño libre
 (URL, QR, NFC)  │  └─ tracker LAZU embebido     │   Sin secretos: solo LAZU_PROFILE_ID
                 └──────────────┬────────────────┘
                                │ POST /api/track  (sendBeacon / fetch keepalive)
                                │ {"profile","event","sessionId","metadata"}
                                ▼
                 ┌───────────────────────────────┐
                 │  app.lazu.bio  (Next.js)      │
                 │                               │
                 │  /api/track   ← público, CORS │
                 │  /login       ← acceso        │
                 │  /dashboard   ← protegido     │
                 └──────────────┬────────────────┘
                                │ Prisma
                                ▼
                 ┌───────────────────────────────┐
                 │  PostgreSQL                   │
                 │  User · Profile · Event       │
                 └───────────────────────────────┘
```

Si la plataforma se cae, **los perfiles siguen funcionando**; solo se pierden los eventos de ese intervalo.

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| App | Next.js 16 (App Router, TypeScript) | API + dashboard en un solo despliegue (Vercel o Node). |
| BD | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) | Relacional, agregaciones por SQL, migraciones versionadas. |
| UI | Tailwind CSS 4 + Recharts | Rápido de mantener; Recharts para la gráfica de 30 días. |
| Auth | bcryptjs + JWT HS256 (`jose`) en cookie httpOnly | Sin servicios externos; suficiente para el MVP. |
| Validación | zod | Esquemas explícitos para todo input. |

No hay Redis, colas ni servicios extra. Todo cabe en "un Next.js + un Postgres".

## Estructura

```
app/
  api/track/route.ts          Eventos del tracker (POST + OPTIONS, público)
  api/leads/route.ts          Contactos con consentimiento (POST + OPTIONS, público)
  c/[code]/route.ts           Tarjeta física: registra el escaneo y redirige (público)
  login/                      Acceso + server actions login/logout
  dashboard/
    page.tsx                  Selector de empresas; alta de clientes (personal LAZU)
    account/                  Cambio de contraseña
    actions.ts                Alta de empresa, cambio de contraseña
    [org]/
      layout.tsx              Cabecera de la empresa, avisos de plan, navegación por rol
      page.tsx                Resumen: KPIs de 30 días y ranking por colaborador
      profiles/[slug]/        Estadísticas y datos de un perfil
      team/                   Miembros, roles y perfiles
      cards/                  Tarjetas: generar, asignar, reasignar, desactivar
      leads/                  Bandeja de contactos y descarga CSV (leads/export)
      plan/                   Plan, datos de la empresa, facturación (LAZU), auditoría
      actions.ts              Server actions de la empresa (todas pasan por requireOrg)
lib/
  tenant.ts                   Contexto de empresa (membresía real) y filtros por empresa
  guards.ts                   requireOrg(slug, permiso): sesión + membresía + permiso
  permissions.ts              Matriz de permisos por rol (OWNER / ADMIN / MEMBER)
  plans.ts                    Qué incluye cada plan y qué pasa al vencer
  stats.ts                    Consultas de estadísticas (siempre con organizationId)
  cards.ts / card-code.ts     Resolución y códigos de tarjetas
  lead-validation.ts          Esquema del formulario de contacto
  profile-template.ts         Plantillas de perfil: validación y llenado seguro
  audit.ts                    Registro de acciones administrativas
  events.ts                   Lista blanca de eventos (cliente y servidor)
  track-validation.ts, cors.ts, rate-limit.ts, user-agent.ts, referrer.ts, csv.ts, urls.ts
  session.ts / auth.ts        Cookie JWT y usuario actual
prisma/                       Esquema, migraciones y seed
scripts/
  generate-profiles.ts        Un HTML por colaborador desde la plantilla de su empresa
  design-profile.ts           Borrador de plantilla con Claude a partir de la descripción del negocio
templates/                    Plantilla de ejemplo con marcadores
tracker/lazu-tracker.js       Fuente del tracker standalone (se embebe en cada HTML)
tests/                        Unitarios (node:test) e integración contra PostgreSQL
```

## Modelo de datos

- **Organization**: la empresa cliente. `slug` (URL del panel), `plan` (`INDIVIDUAL` | `TEAM` | `ENTERPRISE`), `seatLimit` (perfiles activos contratados), `paidUntil`, `status` (`ACTIVE` | `SUSPENDED`), `fallbackUrl` (a dónde llevan las tarjetas sin asignar).
- **User**: persona que entra al panel. `role` = `ADMIN` (personal de LAZU) o `USER` (cliente).
- **Membership**: usuario ↔ empresa con rol `OWNER` | `ADMIN` | `MEMBER`. Un usuario puede pertenecer a varias empresas.
- **Profile**: pertenece a una empresa; `slug` único global (va en el HTML), colaborador asignado (`memberUserId`), datos para generar su HTML y `publicUrl`.
- **Card**: tarjeta física con `code` aleatorio; apunta a un perfil (o a ninguno) y se reasigna sin reimprimir.
- **Event**: `organizationId` (copia desnormalizada para filtrar por empresa sin JOIN), `profileId`, `cardId` opcional, `eventType`, `timestamp` del servidor, `deviceType`, id anónimo y `metadata` plana.
- **Lead**: contacto que dejó un visitante, con `consentAt` y `consentVersion`. Es dato personal de terceros.
- **AuditLog**: quién hizo qué acción administrativa y cuándo.

Decisiones:

- `eventType` es **texto validado contra una lista blanca** (`lib/events.ts`), no un enum de PostgreSQL. `card_scan` y `lead_submit` solo los registra el servidor.
- Índices por `(organizationId, timestamp)` y `(organizationId, eventType, timestamp)` para el resumen de empresa, además de los de perfil.
- **No se guarda la IP** en ninguna tabla. Solo se usa en memoria para el rate limiting.
- La migración `20261029030000_organizations` conserva los datos de la Fase 1: cada dueño de perfiles recibe una empresa propia (plan Individual) y sus eventos pasan a ella.

## Multiempresa y permisos

El aislamiento entre empresas no depende de la interfaz:

1. `lib/tenant.ts` construye el **contexto de empresa** solo a partir de la sesión verificada y de una fila real de `Membership`. Sin membresía (o con la empresa suspendida) no hay contexto. El personal de LAZU actúa como propietario.
2. `lib/guards.ts` → `requireOrg(slug, permiso)` se llama en **cada** página, route handler y server action. Sin membresía o sin permiso responde 404, sin revelar si la empresa existe.
3. Toda consulta privada recibe el contexto y filtra por `ctx.org.id` (`profileWhere`, `leadWhere`, SQL con `e."organizationId" = …`). Los colaboradores, además, solo ven perfiles y contactos propios.
4. Las escrituras buscan cada id junto con `organizationId` (`findFirst({ id, organizationId })`): un id de otra empresa nunca se encuentra. Al asignar una tarjeta o un colaborador se comprueba que también sean de la empresa.
5. `tests/integration/tenant-isolation.test.ts` verifica esto contra PostgreSQL real.

Siguiente refuerzo posible cuando haya más equipo o más código: Row Level Security de PostgreSQL con `organizationId` por sesión, como segunda barrera.

## Flujos públicos

- `GET /c/<código>`: busca la tarjeta (índice único, sin caché para que una reasignación surta efecto al instante), redirige con `302` y `Cache-Control: no-store` solo a URLs `http(s)`, y registra `card_scan` con `via` = `nfc` o `qr` después de responder (`after()`). Bots y más de 20 escaneos por minuto de la misma IP a la misma tarjeta no cuentan.
- `POST /api/leads`: mismo control de origen que `/api/track`, 5 envíos cada 10 min por IP, 4 KB máximo, zod estricto, consentimiento obligatorio, campo trampa para bots, y solo si el plan vigente incluye contactos. Guarda el contacto y un evento `lead_submit` sin datos personales.

## Flujo de `POST /api/track`

1. **Origen**: el header `Origin` debe estar en `ALLOWED_ORIGINS` (en desarrollo, además, cualquier `localhost`). Se comprueba en el servidor, no solo vía CORS, porque `sendBeacon`/`text/plain` no hacen preflight. Respuesta con el origen concreto, nunca `*`.
2. **Rate limit** por IP (60/min por defecto).
3. **Tamaño** máximo de 4 KB.
4. **Validación** zod: slug con formato seguro, evento de la lista blanca, `sessionId` con formato aleatorio, `metadata` plana (≤ 20 claves, valores simples, textos recortados y sin `<` `>`).
5. **Perfil**: existe y está `ACTIVE` (caché en memoria de 60 s para responder rápido). Inexistente e inactivo devuelven el mismo error para no revelar el estado.
6. **Bots** (Googlebot, vistas previas de WhatsApp, headless) se descartan respondiendo éxito.
7. **Inserción** con `timestamp` del servidor y dispositivo derivado del `User-Agent`.
8. Respuesta `{"success": true}`. Los errores solo devuelven un código corto (`invalid_payload`, `invalid_profile`, `rate_limited`…).

## Autenticación del dashboard

- Contraseñas con **bcrypt** (coste 12). El login compara contra un hash ficticio cuando el email no existe para no revelar qué cuentas hay, y limita a 10 intentos por IP cada 15 min.
- Sesión: **JWT HS256** firmado con `AUTH_SECRET`, en cookie `lazu_session` `httpOnly`, `SameSite=Lax`, `Secure` en producción, 7 días.
- `proxy.ts` hace una comprobación optimista (sin cookie → `/login`). La verificación real (firma + usuario existente) está en `lib/auth.ts` y la ejecuta **cada página y cada server action**.
- Toda consulta pasa por el contexto de empresa (ver Multiempresa y permisos): nadie puede ver datos ajenos aunque cambie la URL.
- Usuarios nuevos reciben una contraseña temporal aleatoria (14 caracteres) que se muestra una sola vez; la cambian en Mi cuenta.
- Cabeceras de seguridad globales: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Next.js 16 y Cache Components

El proyecto usa `cacheComponents` (activado por defecto en Next 16). Las páginas del dashboard leen la sesión y la BD en cada petición, así que su contenido va dentro de `<Suspense>`: el esqueleto se sirve al instante y los datos llegan en streaming. No se cachean estadísticas: siempre son en vivo.

## Privacidad

- Sin IP, sin cookies en los perfiles, sin datos personales.
- El id anónimo es aleatorio, por dominio, caduca a los 30 días y se desactiva con Global Privacy Control / Do Not Track.
- El referrer pierde query string y fragmento (pueden llevar emails o tokens).
- `metadata` está acotada y saneada; el tracker solo envía el dominio de los enlaces.
- Los contactos (`Lead`) solo los ven la empresa y el colaborador del perfil; se guardan con fecha y versión del consentimiento. El CSV neutraliza fórmulas de Excel y cada descarga queda en la auditoría.

## Escalabilidad y siguientes pasos

- **Rate limiting y caché de perfiles** viven en memoria por instancia. Con varias instancias (Vercel) cada una cuenta por separado y un cambio de estado puede tardar hasta 60 s en verse en otras instancias; si hace falta un límite global, se reemplaza `lib/rate-limit.ts` por Redis/Upstash sin tocar las rutas.
- **Volumen de eventos**: las agregaciones usan índices por empresa. Cuando crezca, una tabla de agregados diarios (`DailyStat`) alimentada por un cron, sin cambiar el tracker ni la API.
- **Cobro automático**: hoy se registra a mano en Plan → Facturación. Al automatizar (Stripe o Mercado Pago), un webhook actualiza `plan`, `seatLimit` y `paidUntil`; el resto del sistema ya respeta esos campos.
- **Sesiones**: el JWT dura 7 días y no se revoca al cambiar contraseña o quitar a un miembro (perder la membresía sí corta el acceso de inmediato, porque se consulta en cada petición).
- **Nuevos eventos**: añadir a `lib/events.ts` y al tracker.
