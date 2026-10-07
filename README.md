# LAZU · Plataforma central

Tracking, estadísticas y administración de perfiles digitales LAZU (personas y negocios accesibles por URL, QR y NFC).

Cada perfil es un **archivo HTML independiente** con diseño libre, alojado donde quieras (p. ej. Hostinger). Esta plataforma **no renderiza perfiles**: solo los identifica, recibe sus eventos y muestra estadísticas.

- Arquitectura detallada: [ARCHITECTURE.md](ARCHITECTURE.md)
- Cómo integrar el tracker en un HTML: [docs/LAZU_STANDALONE_TRACKER.md](docs/LAZU_STANDALONE_TRACKER.md)

---

## 1. Arquitectura en breve

```
perfil.html (Hostinger, diseño libre) ──POST /api/track──▶ Next.js (app.lazu.bio) ──Prisma──▶ PostgreSQL
                                                              └── /dashboard (protegido)
```

- **Next.js 16 + TypeScript** — API pública `/api/track` y dashboard en un solo proyecto.
- **PostgreSQL + Prisma 7** — tablas `User`, `Profile`, `Event`.
- **Tailwind CSS + Recharts** — interfaz y gráfica de 30 días.
- **Auth propia** — bcrypt + JWT firmado en cookie httpOnly.

## 2. Requisitos

- Node.js 20.9 o superior (probado con Node 22)
- PostgreSQL 14 o superior
- npm

## 3. Variables de entorno

Copia el ejemplo y complétalo:

```bash
cp .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL. |
| `AUTH_SECRET` | Sí | Secreto de ≥ 32 caracteres para firmar sesiones. `openssl rand -base64 48` |
| `ALLOWED_ORIGINS` | Sí en producción | Dominios de los perfiles, separados por coma. Admite `https://*.lazu.bio`. En desarrollo `localhost` siempre se acepta. |
| `TRACK_RATE_LIMIT_PER_MINUTE` | No | Eventos por minuto por IP (por defecto 60). |
| `DASHBOARD_TIMEZONE` | No | Zona horaria de las gráficas (por defecto `UTC`). Ej. `America/Mexico_City`. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Para el seed | Primer usuario administrador (contraseña ≥ 10 caracteres). |

`.env` está en `.gitignore`. Nunca subas credenciales reales.

## 4. Instalar dependencias

```bash
npm install
```

`postinstall` ejecuta `prisma generate` y crea el cliente en `generated/prisma`.

## 5. Configurar PostgreSQL

Cualquier PostgreSQL sirve (local, Docker, Neon, Supabase, Railway…). En local:

```bash
# Ubuntu / Debian
sudo apt install postgresql
sudo -u postgres psql -c "CREATE USER lazu WITH PASSWORD 'lazu' CREATEDB;"
sudo -u postgres createdb -O lazu lazu

# o con Docker
docker run -d --name lazu-db -e POSTGRES_USER=lazu -e POSTGRES_PASSWORD=lazu \
  -e POSTGRES_DB=lazu -p 5432:5432 postgres:16
```

Y en `.env`:

```
DATABASE_URL="postgresql://lazu:lazu@localhost:5432/lazu?schema=public"
```

## 6. Migraciones Prisma

```bash
npm run db:migrate     # desarrollo: aplica migraciones (y crea nuevas si cambias schema.prisma)
npm run db:deploy      # producción: solo aplica migraciones existentes
npm run db:studio      # explorador visual de la base de datos
```

## 7. Ejecutar en local

```bash
npm run dev
```

- Dashboard: <http://localhost:3000/dashboard>
- Login: <http://localhost:3000/login>
- API: `POST http://localhost:3000/api/track`

## 8. Crear el perfil de prueba y el administrador

```bash
npm run db:seed
```

Crea (sin duplicar si ya existen):

- el usuario admin con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`;
- el perfil `test-profile` · "Perfil de Prueba LAZU" · Activo.

Más usuarios:

```bash
npm run user:create -- cliente@correo.com "Juan Pérez" "contraseña-segura" OWNER
npm run user:create -- otra@lazu.bio "Ana" "contraseña-segura" ADMIN
```

Un `OWNER` solo ve sus perfiles. Al crear un perfil en el dashboard se puede asignar su dueño por email.

## 9. Probar el tracking

Con `npm run dev` corriendo, sirve el HTML de prueba **desde otro origen**, igual que si estuviera en Hostinger:

```bash
cd public && python3 -m http.server 5500     # o: npx serve -l 5500
```

1. Abre <http://localhost:5500/test-profile.html> → se registra `page_view`.
2. Pulsa WhatsApp, Llamar, Maps, Sitio web, Guardar contacto e Instagram.
3. Entra a <http://localhost:3000/dashboard> con el admin del seed.
4. Verás los KPIs acumulados, la gráfica de 30 días y, en **Perfil de Prueba LAZU**, la tabla de eventos recientes.

(También puedes abrir <http://localhost:3000/test-profile.html> directamente; la app sirve la carpeta `public`.)

Prueba rápida desde la terminal:

```bash
curl -X POST http://localhost:3000/api/track \
  -H "Origin: http://localhost:5500" \
  -d '{"profile":"test-profile","event":"page_view","sessionId":"anon-prueba123","metadata":{}}'
# {"success":true}
```

Respuestas de error: `origin_not_allowed` (403), `invalid_json` / `invalid_payload` / `invalid_profile` (400), `payload_too_large` (413), `rate_limited` (429).

### Calidad

```bash
npm test           # tests unitarios (validación, CORS, rate limit, tracker)
npm run lint
npm run typecheck
npm run build
```

## 10. Desplegar

### Vercel (recomendado)

1. Sube el repositorio a GitHub e impórtalo en Vercel.
2. Crea un PostgreSQL gestionado (Neon, Supabase, Vercel Postgres…) y copia su URL.
3. En Vercel → Settings → Environment Variables: `DATABASE_URL`, `AUTH_SECRET`, `ALLOWED_ORIGINS` (p. ej. `https://lazu.bio,https://*.lazu.bio`), `DASHBOARD_TIMEZONE`.
4. Build command: `npx prisma migrate deploy && npm run build`.
5. Ejecuta el seed una vez desde tu máquina apuntando a la BD de producción (`DATABASE_URL=… SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed`).
6. Añade el dominio `app.lazu.bio` en Vercel y su registro DNS (CNAME a `cname.vercel-dns.com`).

### Servidor propio (VPS)

```bash
npm ci && npx prisma migrate deploy && npm run build
npm start        # puerto 3000, detrás de Nginx/Caddy con HTTPS
```

Si no hay un proxy delante que fije `X-Forwarded-For`, el rate limiting puede ser burlado; configura el proxy para sobrescribir esa cabecera.

## 11. Crear un nuevo perfil HTML independiente

1. **Regístralo** en el dashboard (admin) → Nuevo perfil → slug `barberia-lux`, nombre, dueño opcional.
2. **Diseña** `barberia-lux.html` como quieras: HTML, CSS y JS propios en un solo archivo. No hay plantilla obligatoria. Puedes partir de `public/test-profile.html` o de cero.
3. **Súbelo** a Hostinger (o cualquier hosting estático) en el dominio/subdominio que prefieras.
4. **Autoriza su dominio** añadiéndolo a `ALLOWED_ORIGINS` de la plataforma (o usa un comodín como `https://*.lazu.bio`).

## 12. Integrar el tracker en un perfil

Pega antes de `</body>`:

```html
<script>
  const LAZU_PROFILE_ID = "barberia-lux";
  const LAZU_ENDPOINT = "https://app.lazu.bio/api/track";
  /* LAZU-TRACKER:START */
  /* LAZU-TRACKER:END */
</script>
```

Inserta el tracker entre los marcadores:

```bash
npm run tracker:sync -- ruta/a/barberia-lux.html
```

Y marca los botones:

```html
<a href="https://wa.me/52..." data-lazu-event="whatsapp_click">WhatsApp</a>
```

Todos los detalles (eventos disponibles, `lazuTrack()` manual, privacidad, depuración): [docs/LAZU_STANDALONE_TRACKER.md](docs/LAZU_STANDALONE_TRACKER.md).

---

## Fuera del alcance de la Fase 1

Editor visual, constructor de perfiles, plantillas, pagos, suscripciones, facturación, app móvil, marketplace, IA y CRM.
