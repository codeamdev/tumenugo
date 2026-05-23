#!/usr/bin/env tsx
/**
 * Creates a user inside a tenant schema.
 *
 * Usage:
 *   npm run tenant:user:create -- \
 *     --slug coffee-garden \
 *     --email mesero@coffeegarden.com \
 *     --name "Juan Pérez" \
 *     --role mesero \
 *     --password "Pass123!"
 *
 * Roles: admin | cajero | mesero | cocina
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

const VALID_ROLES = ['admin', 'cajero', 'mesero', 'cocina'] as const
type Role = typeof VALID_ROLES[number]

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      password: { type: 'string' },
    },
  })

  const { slug, email, name, role, password } = values

  if (!slug || !email || !name || !role || !password) {
    console.error(`
Usage:
  npm run tenant:user:create -- \\
    --slug coffee-garden \\
    --email mesero@coffeegarden.com \\
    --name "Juan Pérez" \\
    --role mesero \\
    --password "Pass123!"

Roles: ${VALID_ROLES.join(' | ')}
    `)
    process.exit(1)
  }

  if (!VALID_ROLES.includes(role as Role)) {
    console.error(`❌ Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`)
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
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (existing) {
      console.error(`❌ A user with email ${email} already exists in tenant "${tenant.name}".`)
      process.exit(1)
    }

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: role as Role,
      })
      .returning()

    console.log(`\n✅ User created in tenant "${tenant.name}"!`)
    console.log(`   ID:    ${user.id}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Role:  ${user.role}`)
    console.log(`   Login: http://${slug}.localhost:3000`)
  })

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
