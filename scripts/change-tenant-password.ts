#!/usr/bin/env tsx
/**
 * Changes a tenant user's password.
 *
 * Usage:
 *   npm run tenant:change-password -- \
 *     --slug coffee-garden \
 *     --email admin@coffeegarden.com \
 *     --password "NuevaPass123!"
 */

import 'dotenv/config'
import { parseArgs } from 'util'
import { pool } from '../src/lib/db/pool'
import { publicDb } from '../src/lib/db/public-db'
import { tenants } from '../src/lib/db/schema/public'
import { withTenant } from '../src/lib/db/tenant-db'
import { users } from '../src/lib/db/schema/tenant'
import { hashPassword } from '../src/lib/auth/password'
import { eq } from 'drizzle-orm'

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string' },
    },
  })

  const { slug, email, password } = values

  if (!slug || !email || !password) {
    console.error(`
Usage:
  npm run tenant:change-password -- \\
    --slug coffee-garden \\
    --email admin@coffeegarden.com \\
    --password "NuevaPass123!"
    `)
    process.exit(1)
  }

  const [tenant] = await publicDb
    .select({ id: tenants.id, schemaName: tenants.schemaName, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) {
    console.error(`❌ Tenant with slug "${slug}" not found.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  await withTenant(tenant.schemaName, async (db) => {
    const [user] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (!user) {
      console.error(`❌ No user found with email "${email}" in tenant "${tenant.name}".`)
      process.exit(1)
    }

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id))

    console.log(`\n✅ Password updated!`)
    console.log(`   Tenant: ${tenant.name}`)
    console.log(`   Email:  ${user.email}`)
    console.log(`   Role:   ${user.role}`)
  })

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
