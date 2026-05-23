import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { pool } from './pool'
import * as schema from './schema/tenant'

// Single drizzle instance wrapping the shared pool.
// Never pass a postgres transaction object to drizzle() — it lacks internal
// type parsers and throws. Use drizzle's own transaction API instead.
const _db = drizzle(pool, { schema })

export type TenantDB = typeof _db

const SCHEMA_RE = /^tenant_[a-z][a-z0-9_]{0,62}$/

function assertValidSchema(name: string): void {
  if (!SCHEMA_RE.test(name)) {
    throw new Error(`Invalid schema name: ${name}`)
  }
}

/**
 * Executes `fn` inside a drizzle transaction scoped to `schemaName`.
 * set_config with local=true ensures search_path only applies for the
 * duration of the transaction and cannot leak across pool connections.
 */
export async function withTenant<T>(
  schemaName: string,
  fn: (db: TenantDB) => Promise<T>
): Promise<T> {
  assertValidSchema(schemaName)
  return _db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('search_path', ${schemaName + ',public'}, true)`
    )
    return fn(tx as unknown as TenantDB)
  })
}

export async function tenantQuery<T>(
  schemaName: string,
  fn: (db: TenantDB) => Promise<T>
): Promise<T> {
  return withTenant(schemaName, fn)
}
