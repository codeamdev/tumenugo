import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { pool } from '@/lib/db/pool'

// POST /api/superadmin/migrate-tenants
// Applies a raw SQL migration to all active tenant schemas.
// Body: { sql: string }  — must be idempotent (use IF NOT EXISTS etc.)
export async function POST(request: NextRequest) {
  await requireSuperadminSession()

  const { sql: migrationSql } = await request.json() as { sql: string }
  if (!migrationSql || typeof migrationSql !== 'string') {
    return NextResponse.json({ error: 'Campo sql requerido' }, { status: 400 })
  }

  const activeTenants = await publicDb
    .select({ schemaName: tenants.schemaName, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.status, 'active'))

  const results: { slug: string; ok: boolean; error?: string }[] = []

  for (const tenant of activeTenants) {
    try {
      await pool.begin(async (tx) => {
        await tx`SELECT set_config('search_path', ${tenant.schemaName + ',public'}, true)`
        await tx.unsafe(migrationSql)
      })
      results.push({ slug: tenant.slug, ok: true })
    } catch (err: any) {
      results.push({ slug: tenant.slug, ok: false, error: err.message })
    }
  }

  return NextResponse.json({ results })
}
