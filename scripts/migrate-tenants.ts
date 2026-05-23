#!/usr/bin/env tsx
/**
 * Applies tenant schema migrations to all active tenants, or a single one.
 *
 * Usage:
 *   npm run db:migrate:tenants                 # all tenants
 *   npm run db:migrate:tenant -- --slug=cafe-azul   # single tenant
 */

import 'dotenv/config'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parseArgs } from 'util'
import { pool } from '../src/lib/db/pool'
import { publicDb } from '../src/lib/db/public-db'
import { tenants } from '../src/lib/db/schema/public'
import { eq } from 'drizzle-orm'

async function migrateSchema(schemaName: string): Promise<{ applied: number }> {
  const migrationsDir = join(process.cwd(), 'drizzle/tenant')
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

  let applied = 0
  for (const file of files) {
    const version = file.replace('.sql', '')

    const [existing] = await pool`
      SELECT version
      FROM ${pool.unsafe(`"${schemaName}".schema_migrations`)}
      WHERE version = ${version}
    `

    if (existing) continue

    console.log(`    apply ${file} → ${schemaName}`)
    const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8')
    await pool.begin(async (tx) => {
      await tx`SELECT set_config('search_path', ${schemaName + ',public'}, true)`
      await tx.unsafe(sqlContent)
    })
    applied++
  }

  return { applied }
}

async function main() {
  const { values } = parseArgs({
    options: { slug: { type: 'string' } },
    allowPositionals: true,
  })

  let tenantList: { schemaName: string; slug: string }[]

  if (values.slug) {
    const [t] = await publicDb
      .select({ schemaName: tenants.schemaName, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, values.slug))
      .limit(1)

    if (!t) {
      console.error(`Tenant not found: ${values.slug}`)
      process.exit(1)
    }
    tenantList = [t]
  } else {
    tenantList = await publicDb
      .select({ schemaName: tenants.schemaName, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.status, 'active'))
  }

  console.log(`\nMigrating ${tenantList.length} tenant(s)...`)

  let totalApplied = 0
  for (const t of tenantList) {
    console.log(`\n  → ${t.slug} (${t.schemaName})`)
    const { applied } = await migrateSchema(t.schemaName)
    totalApplied += applied
    if (applied === 0) console.log('    (up to date)')
  }

  console.log(`\n✅ Total applied: ${totalApplied} migration(s).`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
