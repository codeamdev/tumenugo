import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { taxRates } from '@/lib/db/schema/tenant'

export async function GET() {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(taxRates).where(eq(taxRates.isActive, true))
  )

  return NextResponse.json({ data })
}
