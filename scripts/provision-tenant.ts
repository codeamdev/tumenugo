#!/usr/bin/env tsx
/**
 * CLI to provision a new tenant.
 *
 * Usage:
 *   npm run tenant:provision -- \
 *     --name "Café Azul" \
 *     --slug "cafe-azul" \
 *     --type cafeteria \
 *     --admin-email admin@cafeazul.com \
 *     --admin-name "Carlos García" \
 *     --admin-password "SecurePass123!"
 */

import 'dotenv/config'
import { parseArgs } from 'util'
import { provisionTenant } from '../src/lib/provisioning'
import { pool } from '../src/lib/db/pool'

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      type: { type: 'string' },
      'admin-email': { type: 'string' },
      'admin-name': { type: 'string' },
      'admin-password': { type: 'string' },
      timezone: { type: 'string' },
      color: { type: 'string' },
    },
  })

  const name = values['name']
  const slug = values['slug']
  const type = values['type'] as 'cafeteria' | 'restaurant' | 'fast_food'
  const adminEmail = values['admin-email']
  const adminName = values['admin-name']
  const adminPassword = values['admin-password']

  if (!name || !slug || !type || !adminEmail || !adminName || !adminPassword) {
    console.error(`
Usage:
  npm run tenant:provision -- \\
    --name "Café Azul" \\
    --slug "cafe-azul" \\
    --type cafeteria \\
    --admin-email admin@cafeazul.com \\
    --admin-name "Carlos García" \\
    --admin-password "SecurePass123!"

Types: cafeteria | restaurant | fast_food
    `)
    process.exit(1)
  }

  console.log(`\nProvisioning tenant "${name}" (${slug})...`)

  try {
    const tenant = await provisionTenant({
      name,
      slug,
      businessType: type,
      adminEmail,
      adminName,
      adminPassword,
      timezone: values['timezone'] ?? 'America/Bogota',
      primaryColor: values['color'],
    })

    console.log(`\n✅ Done!`)
    console.log(`   Tenant ID:   ${tenant.id}`)
    console.log(`   Schema:      ${tenant.schemaName}`)
    console.log(`   Panel URL:   http://${slug}.localhost:3000`)
    console.log(`   Admin login: ${adminEmail}`)
  } catch (err) {
    console.error('\n❌ Failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
