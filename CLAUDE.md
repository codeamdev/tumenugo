# CLAUDE.md — CafeteriaOS Web

Next.js app que sirve como frontend web y API backend para el sistema POS multi-tenant.

## Stack

- Next.js 14 (App Router, `output: standalone`)
- TypeScript 5.6.3 — strict mode
- PostgreSQL 16 · postgres.js driver · Drizzle ORM 0.45.2
- Tailwind CSS + shadcn/ui (Radix UI primitivos en `src/components/ui/`)
- JWT (jose): access token 15 min, refresh 7 días
- Zustand ^4.5 (estado POS client-side)
- TanStack Query (fetching en client components)
- Framer Motion (animaciones), Recharts (gráficas)
- Dexie + IndexedDB (offline web), Serwist (PWA — solo producción)
- React Hook Form + Zod (formularios)
- ExcelJS + PDFKit (exports), @anthropic-ai/sdk (parse PDF menú)
- PM2 + Docker + Nginx (despliegue)
- Gestor de paquetes: **npm**

## Comandos

```bash
npm install
npm run dev                              # dev en localhost:3000
npm run dev:wifi                         # dev accesible en red local (0.0.0.0)
npm run dev:db                           # levantar PostgreSQL en Docker
npm run dev:db:stop
npm run dev:db:reset                     # borrar volumen + reiniciar Postgres
npm run build && npm run start           # producción local
npm run lint                             # ESLint
npx tsc --noEmit                         # type check

# Migraciones
npm run db:generate:public               # generar migración schema público
npm run db:generate:tenant               # generar migración schema tenant
npm run db:migrate:public                # correr migraciones en schema public
npm run db:migrate:tenants               # correr en todos los tenants
npm run db:migrate:tenant -- --slug <s>  # tenant específico

# Gestión de tenants
npm run tenant:provision                 # crear tenant (interactivo)
npm run tenant:seed-demo                 # seed datos de demo
npm run tenant:user:create
npm run tenant:change-password
npm run superadmin:create
npm run superadmin:change-password
```

## Variables de entorno (.env.local)

```
NEXT_PUBLIC_BASE_DOMAIN=localhost
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cafeteria
JWT_SECRET=<openssl rand -hex 64>
JWT_REFRESH_SECRET=<openssl rand -hex 64>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
# Opcionales:
ANTHROPIC_API_KEY=
DB_POOL_MAX=10
DEBUG=false
```

## Arquitectura multi-tenant

- Cada tenant tiene su propio **PostgreSQL schema**: `tenant_{slug}` (guiones → underscores).
- Schema **public**: tablas `tenants`, `superadmin_users`, `user_tenant_map`.
- El middleware (`src/middleware.ts`) resuelve el tenant del subdominio → inyecta `x-tenant-slug` en headers.
- `admin.{domain}` → panel superadmin (`/superadmin/`).
- Mobile/API sin subdominio envía `x-tenant-slug` en el header directamente.
- Queries en contexto tenant: siempre `withTenant(schemaName, fn)` — nunca queries sin `search_path`.
- Cache in-process de tenant (60s TTL en `src/lib/tenant.ts`); llamar `invalidateTenantCache(slug)` tras modificar configuración del tenant.

## Estructura

```
src/
  app/
    api/
      auth/          login, logout, refresh, me
      tenant/        orders, products, categories, tables, kitchen,
                     caja, users, configuracion, informes, tax-rates
      superadmin/    gestión de tenants
    login/           login de tenant
    superadmin/      panel superadmin
    dashboard/       dashboard tenant
    pos/             POS (page.tsx server + pos-screen.tsx client)
    pedidos/         gestión de pedidos
    cocina/          display cocina
    caja/            caja registradora
    mesas/           gestión de mesas
    productos/       catálogo de productos
    usuarios/        gestión de empleados
    informes/        reportes y estadísticas
    configuracion/   config del tenant
  components/
    ui/              shadcn/ui — no modificar directamente, extender con wrappers
    layout/          sidebar, theme toggle, logout button
    motion/          wrappers Framer Motion
    providers.tsx    TanStack Query + next-themes
    offline-indicator.tsx
  lib/
    auth/
      jwt.ts         signAccessToken, signRefreshToken, verify* (jose)
      session.ts     getSession(), requireTenantSession(), requireSuperadminSession()
      cookies.ts     helpers de cookie
      password.ts    hash Argon2 (@node-rs/argon2)
    db/
      pool.ts        postgres.js pool (dev: global singleton para hot-reload)
      public-db.ts   instancia Drizzle para schema public
      tenant-db.ts   withTenant() / tenantQuery()
      schema/
        public.ts    schema Drizzle: tenants, superadmin_users, user_tenant_map
        tenant.ts    schema Drizzle: orders, products, categories, tables, users…
    env.ts           vars validadas (getters lazy para requeridas)
    tenant.ts        resolveTenantBySlug(), getCurrentTenant(), cache 60s
    provisioning.ts  provisionTenant() — schema + migraciones + seed
    order-calc.ts    cálculo puro de totales (idéntico al de la app mobile)
    utils.ts         cn() (clsx + tailwind-merge), formatCurrency, formatDateTime
    payment-methods.ts
    offline/         Dexie IndexedDB para modo offline web
  middleware.ts      routing por subdominio + CORS preflight
  types/index.ts

drizzle/
  public/            archivos SQL para schema public
  tenant/            archivos SQL por tenant (corridos al provisionar y al migrar)

scripts/             tsx scripts de administración (provisioning, seeds, migraciones)
nginx/               nginx.conf, nginx.prod.conf
```

## Convenciones

**Server vs Client**
- Server Components por defecto. `'use client'` solo cuando se necesita estado/efectos.
- Auth en Server Components: `requireTenantSession()` o `requireSuperadminSession()` — redirigen si no autenticado.
- Datos en Client Components: TanStack Query (fetch a las API routes).

**Base de datos**
- Schema público: `publicDb` de `@/lib/db/public-db`.
- Schema tenant: `withTenant(schemaName, fn)` — el `schemaName` viene del JWT (`session.schemaName`).
- `set_config(search_path, ..., true)` solo es válido dentro de una transacción; `withTenant` lo garantiza.
- Pool dev es singleton global (`globalPool.pgPool`) para no agotar conexiones en hot-reload.

**Auth**
- Web: cookies httpOnly. Mobile: Bearer token en header `Authorization`.
- `getSession()` soporta ambos — primero lee cookie, luego Bearer.
- Access token: 15 min. Refresh token: 7 días. Rotación en `/api/auth/refresh`.

**Env vars**
- Server-side: importar `env` de `@/lib/env` (valida en runtime, no en build).
- Cliente: `process.env.NEXT_PUBLIC_*` directamente — nunca importar `env` en client components.

**Estilos**
- Tailwind + `cn()` para condicionales. Sin CSS modules ni styled-components.
- Componentes `src/components/ui/` son shadcn/ui generados — no editar directamente; crear wrappers.

**Path alias**: `@/` → `src/`.

## Reglas / cosas a evitar

- No hacer queries de tenant sin `withTenant` — el search_path por defecto apunta al schema `public`.
- `schemaName` tiene regex estricto `tenant_[a-z][a-z0-9_]{0,62}`. Slugs con guión → underscore (`slugToSchema` en `provisioning.ts`).
- No importar `@node-rs/argon2`, `pdf-parse`, `@anthropic-ai/sdk` en client components — son `serverComponentsExternalPackages`.
- No acceder a `env.DATABASE_URL` (ni otros getters) durante build (next build evalúa los módulos).
- Serwist (PWA) está deshabilitado en desarrollo — no buscar `sw.js` en local.
- `DB_POOL_MAX` no está en `.env.example`; el default es 10. Ajustar en producción.
- No llamar `invalidateTenantCache` solo cuando se modifica el tenant desde superadmin — también al cambiar config en el panel del tenant.

## Eficiencia de tokens

- Respuestas cortas. Sin preámbulos ni resúmenes finales.
- No explicar qué hace el framework — el stack ya es conocido.
- Leer solo las secciones del archivo necesarias (`offset` + `limit`).
- No hacer `Read` de un archivo recién escrito para verificar.
- Preferir `Edit` sobre `Write` en archivos existentes.
- Agrupar tool calls independientes en paralelo.
- Si la tarea es clara, ejecutar sin pedir confirmación previa.

## Definición de "terminado"

```bash
npm run lint        # ESLint sin errores
npx tsc --noEmit    # type check sin errores
```

No hay tests automatizados. Verificación manual en dev server (`npm run dev`).
