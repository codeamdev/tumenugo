#!/usr/bin/env tsx
/**
 * Applies public schema migrations.
 * Run once on initial setup and after any changes to src/lib/db/schema/public.ts.
 *
 * Usage: npm run db:migrate:public
 */

import 'dotenv/config'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { pool } from '../src/lib/db/pool'

async function main() {
  const migrationsDir = join(process.cwd(), 'drizzle/public')
  let files: string[]

  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  } catch {
    console.error(`Migrations directory not found: ${migrationsDir}`)
    console.error('Run: npm run db:generate:public')
    process.exit(1)
  }

  if (files.length === 0) {
    console.log('No migrations found.')
    await pool.end()
    return
  }

  // Ensure migrations table exists in public schema
  await pool`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  let applied = 0
  for (const file of files) {
    const version = file.replace('.sql', '')

    const [existing] = await pool`
      SELECT version FROM schema_migrations WHERE version = ${version}
    `

    if (existing) {
      console.log(`  skip  ${file}`)
      continue
    }

    console.log(`  apply ${file}`)
    const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8')
    await pool.unsafe(sqlContent)
    await pool`INSERT INTO schema_migrations (version) VALUES (${version})`
    applied++
  }

  console.log(`\n✅ Applied ${applied} migration(s).`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
