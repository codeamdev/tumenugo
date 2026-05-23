# CafeteriaOS

Sistema POS multitenant SaaS para cafeterías y restaurantes. Construido con Next.js 14 App Router, PostgreSQL schema-per-tenant, y PWA.

## Stack

- **Frontend/Backend**: Next.js 14 App Router (monorepo)
- **ORM**: Drizzle ORM + postgres.js
- **Base de datos**: PostgreSQL 16 (schema-per-tenant)
- **Auth**: JWT (jose) + argon2id + cookies httpOnly
- **UI**: shadcn/ui + Tailwind CSS + Framer Motion
- **PWA**: next-pwa (Workbox) + Dexie.js (IndexedDB)
- **Reportes**: Recharts + ExcelJS
- **Infra**: Docker Compose + Nginx wildcard SSL

---

## Desarrollo local

### Requisitos previos
- Node.js 20+
- PostgreSQL 16 (local o Docker)
- npm

### 1. Clonar e instalar

```bash
git clone <repo>
cd cafeteria
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/cafeteria
JWT_SECRET=genera-un-secreto-largo-aqui
JWT_REFRESH_SECRET=otro-secreto-diferente-aqui
NEXT_PUBLIC_BASE_DOMAIN=localhost:3000
```

### 3. Crear base de datos y migraciones

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE cafeteria;"

# Migrar esquema público (tenants, superadmin_users)
npm run db:migrate:public

# Crear superadmin
npm run superadmin:create
```

### 4. Levantar el servidor

```bash
npm run dev
```

Acceder a `http://localhost:3000` — redirige al panel superadmin.

### Subdominios en desarrollo

Chrome/Edge soportan `*.localhost` nativamente. Añadir en `.env`:
```env
NEXT_PUBLIC_BASE_DOMAIN=localhost:3000
```

Luego acceder al tenant como: `http://mi-cafeteria.localhost:3000`

---

## Scripts de gestión

```bash
# Crear un tenant (interactivo)
npm run tenant:provision

# Cargar datos demo completos
npm run tenant:seed-demo

# Migrar todos los tenants activos
npm run db:migrate:tenants

# Migrar un tenant específico
npm run db:migrate:tenant <slug>
```

---

## Arquitectura multitenant

Cada tenant vive en su propio **esquema PostgreSQL** (`tenant_{slug}`). El esquema `public` solo contiene:
- `tenants` — directorio de clientes
- `superadmin_users` + `superadmin_refresh_tokens`

### Aislamiento de requests

```typescript
await withTenant(tenant.schemaName, async (db) => {
  // search_path = tenant_xxx,public — scoped to this transaction
  return db.select().from(orders)...
})
```

El `set_config('search_path', ..., true)` es transaction-local → sin leakage entre requests concurrentes.

### Seguridad schema names

Los nombres de esquema se validan con regex `/^tenant_[a-z][a-z0-9_]{0,62}$/` antes de cualquier SQL.

---

## Módulos

| Ruta | Módulo |
|------|--------|
| `/dashboard` | KPIs del día |
| `/pos` | Punto de venta (3 columnas: órdenes / catálogo / carrito) |
| `/mesas` | Plano del salón con estado de mesas |
| `/productos` | Catálogo + modificadores |
| `/caja` | Apertura, arqueo y cierre de turno |
| `/informes` | Reportes con gráficas + exportar Excel |
| `/configuracion` | Ajustes del negocio (solo admin) |
| `/superadmin` | Panel de gestión de tenants |

---

## Roles

| Rol | Acceso |
|-----|--------|
| `admin` | Todo |
| `cajero` | POS, caja, informes |
| `mesero` | POS, mesas |
| `cocina` | Vista de pedidos (pendiente: KDS) |

---

## PWA y modo offline

- Service worker con Workbox (via next-pwa)
- Estrategia **NetworkFirst** para APIs con cache 1h
- **CacheFirst** para estáticos e imágenes
- Dexie.js para cola de pedidos offline en IndexedDB
- Sincronización automática al recuperar conexión

---

## Producción con Docker

### Primer despliegue

```bash
# 1. Configurar variables en .env (mismo formato que desarrollo)
cp .env.example .env
nano .env

# 2. Certificado SSL wildcard
DOMAIN=tudominio.com EMAIL=tu@email.com ./scripts/ssl-setup.sh

# 3. Editar nginx/nginx.conf — reemplazar yourdomain.com

# 4. Levantar servicios
docker compose up -d

# 5. Migraciones y superadmin
docker compose exec app npm run db:migrate:public
docker compose exec app npm run superadmin:create
```

### Actualizar

```bash
docker compose pull
docker compose up -d --build
docker compose exec app npm run db:migrate:tenants
```

### Logs

```bash
docker compose logs -f app
docker compose logs -f nginx
```

---

## Backups

```bash
# Backup manual
DB_PASSWORD=mypassword ./scripts/backup.sh

# Programar backup diario (cron)
echo "0 3 * * * root DB_PASSWORD=mypassword /ruta/scripts/backup.sh >> /var/log/cafeteria-backup.log 2>&1" \
  | sudo tee /etc/cron.d/cafeteria-backup

# Restaurar
./scripts/restore.sh /var/backups/cafeteria/cafeteria_20260101_030000.sql.gz
```

Los backups se retienen 14 días por defecto (`RETAIN_DAYS=14`).

---

## Variables de entorno (producción)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secreto para access tokens (≥32 chars) |
| `JWT_REFRESH_SECRET` | Secreto para refresh tokens (≥32 chars) |
| `NEXT_PUBLIC_BASE_DOMAIN` | Dominio base (ej: `tudominio.com`) |
| `DB_USER` | Usuario PostgreSQL (docker-compose) |
| `DB_PASSWORD` | Contraseña PostgreSQL (docker-compose) |

---

## Desarrollo: flujo de trabajo

### Agregar una migración

1. Editar `src/lib/db/schema/tenant.ts` o `public.ts`
2. Generar SQL: `npm run db:generate:tenant` o `npm run db:generate:public`
3. Aplicar: `npm run db:migrate:tenants` o `npm run db:migrate:public`

### Crear un nuevo tenant (demo)

```bash
npm run tenant:provision
# Nombre: Mi Restaurante
# Slug: mi-restaurante
# Admin email: admin@mi-restaurante.com
# Admin password: secreto123
```

Acceder: `http://mi-restaurante.localhost:3000`

---

## Licencia

Propietaria — uso interno.
