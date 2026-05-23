#!/usr/bin/env tsx
/**
 * Creates the initial superadmin user.
 *
 * Usage:
 *   npm run superadmin:create -- \
 *     --email admin@cafeteriaos.com \
 *     --name "Admin Principal" \
 *     --password "SecurePass123!"
 */

import 'dotenv/config'
import { parseArgs } from 'util'
import { pool } from '../src/lib/db/pool'
import { publicDb } from '../src/lib/db/public-db'
import { superadminUsers } from '../src/lib/db/schema/public'
import { hashPassword } from '../src/lib/auth/password'
import { eq } from 'drizzle-orm'

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
    },
  })

  const { email, name, password } = values

  if (!email || !name || !password) {
    console.error(`
Usage:
  npm run superadmin:create -- \\
    --email admin@cafeteriaos.com \\
    --name "Admin Principal" \\
    --password "SecurePass123!"
    `)
    process.exit(1)
  }

  const [existing] = await publicDb
    .select({ id: superadminUsers.id })
    .from(superadminUsers)
    .where(eq(superadminUsers.email, email.toLowerCase()))
    .limit(1)

  if (existing) {
    console.error(`❌ A superadmin with email ${email} already exists.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const [user] = await publicDb
    .insert(superadminUsers)
    .values({
      email: email.toLowerCase(),
      name,
      passwordHash,
    })
    .returning()

  console.log(`\n✅ Superadmin created!`)
  console.log(`   ID:    ${user.id}`)
  console.log(`   Email: ${user.email}`)
  console.log(`   Login: http://admin.localhost:3000`)

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
