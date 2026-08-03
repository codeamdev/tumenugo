import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { purchaseProducts } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  unit: z.string().min(1).max(50).default('unidad'),
})

export async function GET(_: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, (db) =>
    db.select().from(purchaseProducts).where(eq(purchaseProducts.isActive, true)).orderBy(asc(purchaseProducts.name))
  )
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body = createSchema.parse(await req.json())
    const [created] = await withTenant(tenant.schemaName, (db) =>
      db.insert(purchaseProducts).values(body).returning()
    )
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
