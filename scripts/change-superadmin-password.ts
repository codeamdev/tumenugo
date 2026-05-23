#!/usr/bin/env tsx
/**
 * Changes a superadmin user's password.
 *
 * Usage:
 *   npm run superadmin:change-password -- \
 *     --email admin@cafeteriaos.com \
 *     --password "NuevaPass123!"
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
      password: { type: 'string' },
    },
  })

  const { email, password } = values

  if (!email || !password) {
    console.error(`
Usage:
  npm run superadmin:change-password -- \\
    --email admin@cafeteriaos.com \\
    --password "NuevaPass123!"
    `)
    process.exit(1)
  }

  const [user] = await publicDb
    .select({ id: superadminUsers.id, email: superadminUsers.email })
    .from(superadminUsers)
    .where(eq(superadminUsers.email, email.toLowerCase()))
    .limit(1)

  if (!user) {
    console.error(`❌ No superadmin found with email: ${email}`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  await publicDb
    .update(superadminUsers)
    .set({ passwordHash })
    .where(eq(superadminUsers.id, user.id))

  console.log(`\n✅ Password updated for superadmin: ${user.email}`)

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
