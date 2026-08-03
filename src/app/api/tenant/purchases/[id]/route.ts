import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { purchases } from '@/lib/db/schema/tenant'

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  await withTenant(tenant.schemaName, (db) =>
    db.delete(purchases).where(eq(purchases.id, params.id))
  )
  return NextResponse.json({ ok: true })
}
