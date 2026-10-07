# Arquitectura de LAZU

## Idea central

LAZU **no es un CMS**. Cada perfil digital es un archivo HTML independiente y autónomo (`juan.html`, `barberia-lux.html`) con su propio HTML, CSS, JavaScript, contenido y diseño. Dos perfiles pueden no parecerse en nada.

La plataforma central (este repositorio) **nunca renderiza perfiles**. Solo:

1. Identifica cada perfil (slug público).
2. Recibe eventos de los perfiles.
3. Guarda estadísticas.
4. Las muestra en un dashboard.
5. Administra perfiles y usuarios.
6. (Más adelante) planes y pagos.

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
  api/track/route.ts          Endpoint público de eventos (POST + OPTIONS)
  login/                      Página de acceso + server actions login/logout
  dashboard/
    layout.tsx                Cabecera y menú de usuario
    page.tsx                  Resumen global (KPIs, gráfica, perfiles, alta de perfil)
    actions.ts                Server actions de administración (crear perfil, cambiar estado)
    profiles/[slug]/page.tsx  Estadísticas de un perfil
components/                   UI reutilizable (KPI, tarjeta, gráfica, badge)
lib/
  events.ts                   Lista blanca de tipos de evento
  track-validation.ts         Esquema zod del payload de /api/track
  cors.ts                     Orígenes permitidos (ALLOWED_ORIGINS, comodines)
  rate-limit.ts               Rate limiting en memoria
  user-agent.ts               Tipo de dispositivo y detección de bots
  referrer.ts                 Recorte de referrer (sin query string)
  profiles.ts                 Búsqueda de perfil activo con caché de 60 s
  session.ts / auth.ts        Cookie JWT y capa de acceso a datos (requireUser, profileScope)
  stats.ts                    Consultas de estadísticas
  db.ts / config.ts           Cliente Prisma y configuración por entorno
prisma/
  schema.prisma               Modelo de datos
  migrations/                 Migraciones SQL
  seed.ts                     Admin inicial + perfil test-profile
tracker/lazu-tracker.js       Fuente del tracker standalone (se embebe en cada HTML)
public/test-profile.html      Perfil de ejemplo 100 % independiente
proxy.ts                      Redirección optimista a /login sin cookie
tests/                        Tests unitarios (node:test)
```

## Modelo de datos

- **User**: quien entra al dashboard. `role` = `ADMIN` (ve y gestiona todo) u `OWNER` (solo ve sus perfiles).
- **Profile**: `slug` único y público, `name`, `status` (`ACTIVE` | `INACTIVE` | `SUSPENDED`), `ownerUserId`.
- **Event**: `profileId`, `eventType`, `timestamp` (lo pone el servidor), `referrer` (solo origen + ruta), `userAgent`, `deviceType`, `anonymousSessionId`, `metadata` (JSON plano opcional).

Decisiones:

- `eventType` es **texto validado contra una lista blanca** (`lib/events.ts`), no un enum de PostgreSQL: agregar un evento nuevo no requiere migración.
- Índices `(profileId, timestamp)` y `(profileId, eventType, timestamp)` para las consultas del dashboard.
- **No se guarda la IP** en ninguna tabla. Solo se usa en memoria para el rate limiting.
- Borrar un perfil borra sus eventos (`onDelete: Cascade`); borrar un usuario deja sus perfiles sin dueño.

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
- Todas las consultas pasan por `profileScope(user)`: un `OWNER` no puede ver perfiles ajenos aunque cambie la URL.

## Next.js 16 y Cache Components

El proyecto usa `cacheComponents` (activado por defecto en Next 16). Las páginas del dashboard leen la sesión y la BD en cada petición, así que su contenido va dentro de `<Suspense>`: el esqueleto se sirve al instante y los datos llegan en streaming. No se cachean estadísticas: siempre son en vivo.

## Privacidad

- Sin IP, sin cookies en los perfiles, sin datos personales.
- El id anónimo es aleatorio, por dominio, caduca a los 30 días y se desactiva con Global Privacy Control / Do Not Track.
- El referrer pierde query string y fragmento (pueden llevar emails o tokens).
- `metadata` está acotada y saneada; el tracker solo envía el dominio de los enlaces.

## Escalabilidad y siguientes pasos

- **Rate limiting y caché de perfiles** viven en memoria por instancia. Con varias instancias (Vercel) cada una cuenta por separado; si hace falta un límite global, se reemplaza `lib/rate-limit.ts` por Redis/Upstash sin tocar la ruta.
- **Volumen de eventos**: las agregaciones se hacen sobre `Event` con índices. Cuando crezca, se puede añadir una tabla de agregados diarios (`DailyStat`) alimentada por un cron, sin cambiar el tracker ni la API.
- **Planes y pagos** (fase posterior): nuevas tablas `Plan`/`Subscription` ligadas a `User`; el `status` del perfil ya permite suspender perfiles impagos.
- **Nuevos eventos**: añadir a `lib/events.ts` y al tracker.
