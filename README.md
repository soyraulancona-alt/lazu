# LAZU · Plataforma central

Tracking, estadísticas y administración de perfiles digitales LAZU (personas y negocios accesibles por URL, QR y NFC), pensada para **empresas con equipos comerciales**: cada empresa administra a sus colaboradores, sus tarjetas físicas reasignables y los contactos que generan.

Cada perfil es un **archivo HTML independiente** con diseño libre, alojado donde quieras (p. ej. Hostinger). Esta plataforma **no renderiza perfiles**: los identifica, recibe sus eventos y contactos, redirige las tarjetas y muestra estadísticas.

- Arquitectura detallada: [ARCHITECTURE.md](ARCHITECTURE.md)
- Cómo integrar el tracker en un HTML: [docs/LAZU_STANDALONE_TRACKER.md](docs/LAZU_STANDALONE_TRACKER.md)

---

## 1. Arquitectura en breve

```
Tarjeta NFC/QR ──GET /c/<código>──▶ Next.js (app.lazu.bio) ──302──▶ perfil.html (Hostinger, diseño libre)
perfil.html ──POST /api/track, /api/leads──▶ Next.js ──Prisma──▶ PostgreSQL
                                             └── /dashboard/<empresa> (protegido, multiempresa)
```

- **Next.js 16 + TypeScript** — API pública `/api/track` y dashboard en un solo proyecto.
- **PostgreSQL + Prisma 7** — `Organization`, `Membership`, `User`, `Profile`, `Card`, `Event`, `Lead`, `AuditLog`.
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

- el administrador de LAZU con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`;
- la empresa `lazu-demo` (plan Equipo, 5 perfiles) con el admin como propietario;
- el perfil `test-profile` · "Perfil de Prueba LAZU" · Activo, y una tarjeta asignada (el seed imprime su enlace).

Los clientes se dan de alta desde el panel: **Empresas → Nueva empresa** (solo personal de LAZU) crea la empresa y su propietario, y el propietario agrega a su equipo en **Equipo**. Si la persona no tiene cuenta, se muestra una contraseña temporal una sola vez; cada quien la cambia en **Mi cuenta**.

Personal de LAZU desde la terminal:

```bash
npm run user:create -- otra@lazu.bio "Ana" "contraseña-segura" ADMIN
```

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

5. Abre el enlace de tarjeta que imprimió el seed (`http://localhost:3000/c/<código>`): redirige al perfil y suma un escaneo. Con `?v=qr` cuenta como QR.
6. Llena "¿Te contacto yo?" en el perfil: el contacto aparece en **Contactos** del panel.

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
npm test           # tests unitarios (validación, permisos, planes, tarjetas, CSV, plantillas, tracker)
DATABASE_URL_TEST="postgresql://…/lazu_test" npm run test:db   # aislamiento entre empresas contra PostgreSQL real
npm run lint
npm run typecheck
npm run build
```

## 10. Desplegar

### Vercel + Neon (recomendado)

1. Fusiona el código en `main` en GitHub.
2. En [vercel.com](https://vercel.com) entra con tu cuenta de GitHub → **Add New → Project** → importa el repositorio `lazu` → en **Environment Variables** añade:
   - `AUTH_SECRET`: texto aleatorio de 32 caracteres o más.
   - `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`: tu usuario administrador (contraseña ≥ 10 caracteres).
   - `DASHBOARD_TIMEZONE` (opcional), p. ej. `America/Mexico_City`.
   - `ALLOWED_ORIGINS`: los dominios de tus perfiles, p. ej. `https://lazu.bio,https://*.lazu.bio`.
   - `CARD_BASE_URL` (opcional): dominio que se graba en las tarjetas, por defecto `https://app.lazu.bio`.
   Pulsa **Deploy**. El primer despliegue fallará porque todavía no hay base de datos; es normal.
3. En el proyecto de Vercel → **Storage → Create Database → Neon** → conéctala al proyecto. Esto crea `DATABASE_URL` y `DATABASE_URL_UNPOOLED` automáticamente.
4. **Deployments → ⋯ → Redeploy**.

En cada despliegue, el script `vercel-build` aplica las migraciones (`prisma migrate deploy`), ejecuta el seed (idempotente: crea el admin y `test-profile` solo si no existen) y compila. Los HTML servidos por la propia app (como `/test-profile.html`) siempre pueden enviar eventos, sin añadir su dominio a `ALLOWED_ORIGINS`.

Para usar `app.lazu.bio`: Vercel → Settings → Domains → añade `app.lazu.bio` y crea en tu DNS el registro CNAME que Vercel indique.

### Servidor propio (VPS)

```bash
npm ci && npx prisma migrate deploy && npm run build
npm start        # puerto 3000, detrás de Nginx/Caddy con HTTPS
```

Si no hay un proxy delante que fije `X-Forwarded-For`, el rate limiting puede ser burlado; configura el proxy para sobrescribir esa cabecera.

## 11. Crear un nuevo perfil HTML independiente

1. **Regístralo** en el panel de la empresa → Equipo → Nuevo perfil → identificador `barberia-lux`, nombre, colaborador y, cuando esté publicado, su URL (las tarjetas redirigen ahí).
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

## 13. Empresas, roles y planes

| Rol | Qué puede hacer |
|---|---|
| Personal de LAZU (`User.role = ADMIN`) | Todo en todas las empresas: alta de clientes, plan, perfiles incluidos, vigencia, suspensión. |
| Propietario | Todo en su empresa, incluidos otros propietarios y los datos de la empresa. |
| Administrador | Equipo, perfiles, tarjetas, contactos y CSV. No toca propietarios. |
| Colaborador | Solo sus perfiles, sus estadísticas y sus contactos. |

Los planes (`lib/plans.ts`) deciden qué se ve: **Individual** (estadísticas propias, contactos, tarjetas), **Equipo** (+ ranking por colaborador y CSV) y **Empresa** (+ registro de acciones). La unidad de cobro son los **perfiles activos** (`seatLimit`). Si `paidUntil` vence, LAZU sigue registrando la actividad, pero el ranking, los contactos y las tarjetas nuevas quedan bloqueados hasta renovar. El cobro se hace fuera de la plataforma y se registra en **Plan → Facturación**.

## 14. Tarjetas físicas reasignables

En **Tarjetas** se generan códigos (`/c/<código>`). Graba en el chip NFC `https://app.lazu.bio/c/<código>` y en el QR `https://app.lazu.bio/c/<código>?v=qr`. La tarjeta redirige al perfil asignado en ese momento: si alguien sale de la empresa, se reasigna o se desactiva sin reimprimir. Una tarjeta desactivada o sin asignar lleva a la página de respaldo de la empresa (Plan → Datos de la empresa).

## 15. Generar los perfiles de un equipo

1. **Plantilla de la empresa**: un HTML con marcadores (`{{name}}`, `{{jobTitle}}`, `{{whatsapp|url}}`…). Parte de [`templates/plantilla-ejemplo.html`](templates/plantilla-ejemplo.html) o pide un borrador a Claude a partir de la descripción del negocio:

   ```bash
   ANTHROPIC_API_KEY=… npm run profile:design -- descripcion.txt plantilla.html --preview vista-previa/
   ```

   El borrador se valida contra el contrato de LAZU (sin scripts ni estilos externos, sin peticiones de red, con el bloque del tracker). Revísalo antes de usarlo.
2. **Un HTML por colaborador** con los datos capturados en el panel:

   ```bash
   npm run profiles:generate -- <empresa> plantilla.html salida/ --endpoint https://app.lazu.bio/api/track
   ```

   Cada archivo lleva su `LAZU_PROFILE_ID`, los datos escapados y el tracker oficial. Súbelos al hosting y pega la URL de cada uno en su perfil del panel.

