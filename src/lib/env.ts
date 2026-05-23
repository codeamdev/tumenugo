/**
 * Variables de entorno validadas y tipadas.
 *
 * - Usa getters para las vars requeridas → el error ocurre en runtime cuando
 *   se accede, no en build time (lo que rompería el Dockerfile).
 * - Importar solo desde código server-side (API routes, lib/).
 * - Para vars NEXT_PUBLIC_* en el cliente usar process.env directamente.
 */

function required(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(
      `[env] Variable de entorno requerida no encontrada: ${key}\n` +
      `  → En desarrollo: agrégala a .env.local\n` +
      `  → En producción: agrégala a .env.production (o al sistema Docker/PM2)`
    )
  }
  return val
}

function optional(key: string, defaultVal = ''): string {
  return process.env[key] ?? defaultVal
}

export const env = {
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',

  // ── Base de datos ─────────────────────────────────────────────────────────
  get DATABASE_URL()  { return required('DATABASE_URL') },
  get DB_POOL_MAX()   { return parseInt(optional('DB_POOL_MAX', '10')) },

  // ── JWT ───────────────────────────────────────────────────────────────────
  get JWT_SECRET()         { return required('JWT_SECRET') },
  get JWT_REFRESH_SECRET() { return required('JWT_REFRESH_SECRET') },

  // ── Dominio (también disponible en cliente como NEXT_PUBLIC_) ─────────────
  NEXT_PUBLIC_BASE_DOMAIN: optional('NEXT_PUBLIC_BASE_DOMAIN', 'localhost'),
  NEXT_PUBLIC_APP_URL:     optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

  // ── Opcionales ────────────────────────────────────────────────────────────
  DEBUG: optional('DEBUG', 'false'),
} as const

/** true solo en desarrollo Y con DEBUG=true explícito */
export const isDev  = env.NODE_ENV !== 'production'
export const isProd = env.NODE_ENV === 'production'
export const DEBUG  = env.DEBUG === 'true' && !isProd
