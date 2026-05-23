import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { publicDb } from './db/public-db'
import { tenants, type TaxConfigEntry } from './db/schema/public'
import { pool } from './db/pool'
import { hashPassword } from './auth/password'
import { eq } from 'drizzle-orm'

const SCHEMA_RE = /^tenant_[a-z][a-z0-9_]{0,62}$/

function slugToSchema(slug: string): string {
  return `tenant_${slug.replace(/-/g, '_')}`
}

function assertValidSlug(slug: string): void {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Use lowercase letters, numbers and hyphens.`)
  }
}

export interface ProvisionOptions {
  name: string
  slug: string
  businessType: 'cafeteria' | 'restaurant' | 'fast_food'
  adminEmail: string
  adminName: string
  adminPassword: string
  timezone?: string
  primaryColor?: string
}

export async function provisionTenant(opts: ProvisionOptions) {
  assertValidSlug(opts.slug)
  const schemaName = slugToSchema(opts.slug)

  if (!SCHEMA_RE.test(schemaName)) {
    throw new Error(`Generated schema name is invalid: ${schemaName}`)
  }

  const defaultTaxConfig: TaxConfigEntry[] = [
    { name: 'IVA', type: 'IVA', rate: 19, isDefault: true },
    { name: 'INC', type: 'INC', rate: 8, isDefault: false },
    { name: 'Sin impuesto', type: 'none', rate: 0, isDefault: false },
  ]

  // 1. Create tenant record (will fail on duplicate slug due to UNIQUE constraint)
  const [tenant] = await publicDb
    .insert(tenants)
    .values({
      name: opts.name,
      slug: opts.slug,
      schemaName,
      businessType: opts.businessType,
      status: 'active',
      timezone: opts.timezone ?? 'America/Bogota',
      taxConfig: defaultTaxConfig,
      primaryColor: opts.primaryColor ?? '#2563eb',
    })
    .returning()

  try {
    // 2. Create PostgreSQL schema
    await pool.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

    // 3. Run all tenant migration files in order
    const migrationsDir = join(process.cwd(), 'drizzle/tenant')
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      await pool.begin(async (tx) => {
        await tx`SELECT set_config('search_path', ${schemaName + ',public'}, true)`
        await tx.unsafe(sql)
      })
    }

    // 4. Create admin user in the new schema
    const passwordHash = await hashPassword(opts.adminPassword)
    await pool.begin(async (tx) => {
      await tx`SELECT set_config('search_path', ${schemaName + ',public'}, true)`
      await tx`
        INSERT INTO users (email, password_hash, name, role, is_active)
        VALUES (${opts.adminEmail}, ${passwordHash}, ${opts.adminName}, 'admin', true)
      `
    })

    // 5. Seed default categories and tax rates
    await pool.begin(async (tx) => {
      await tx`SELECT set_config('search_path', ${schemaName + ',public'}, true)`
      await seedDefaultData(tx as unknown as typeof pool)
    })

    console.log(`✓ Tenant "${opts.slug}" provisioned → schema "${schemaName}"`)
    return tenant
  } catch (err) {
    // Rollback: delete tenant record and drop schema if something failed
    await publicDb.delete(tenants).where(eq(tenants.id, tenant.id))
    await pool.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {})
    throw err
  }
}

async function seedDefaultData(tx: typeof pool) {
  await tx`
    INSERT INTO categories (name, sort_order, color, emoji) VALUES
      ('Bebidas calientes', 1, '#92400e', '☕'),
      ('Bebidas frías', 2, '#1d4ed8', '🥤'),
      ('Alimentos', 3, '#15803d', '🍽️'),
      ('Postres', 4, '#9333ea', '🍰'),
      ('Combos', 5, '#ea580c', '🎁')
    ON CONFLICT DO NOTHING
  `
  await tx`
    INSERT INTO tax_rates (name, type, rate, is_default, is_active) VALUES
      ('IVA 19%', 'IVA', 19.00, true, true),
      ('INC 8%', 'INC', 8.00, false, true),
      ('Sin impuesto', 'none', 0.00, false, true)
    ON CONFLICT DO NOTHING
  `
}

export async function suspendTenant(slug: string): Promise<void> {
  await publicDb
    .update(tenants)
    .set({ status: 'suspended' })
    .where(eq(tenants.slug, slug))
}

export async function activateTenant(slug: string): Promise<void> {
  await publicDb
    .update(tenants)
    .set({ status: 'active' })
    .where(eq(tenants.slug, slug))
}
