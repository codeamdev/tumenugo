import postgres from 'postgres'
import { env, isProd } from '@/lib/env'

const globalPool = global as typeof globalThis & { pgPool?: postgres.Sql }

function createPool(): postgres.Sql {
  return postgres(env.DATABASE_URL, {
    max: env.DB_POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  })
}

// En desarrollo reutiliza el pool entre hot-reloads para evitar agotamiento de conexiones.
export const pool: postgres.Sql = isProd
  ? createPool()
  : (globalPool.pgPool ??= createPool())
