import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc, gte, lte, and } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { purchases } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  purchaseProductId: z.string().uuid().optional(),
  productName: z.string().min(1).max(300),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().optional(),
  purchasedAt: z.string().datetime().optional(),
})

export async function GET(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const filters: ReturnType<typeof and>[] = []
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (from) filters.push(gte(purchases.purchasedAt, new Date(from + 'T00:00:00Z')))
  if (to)   filters.push(lte(purchases.purchasedAt, new Date(to + 'T23:59:59Z')))

  const data = await withTenant(tenant.schemaName, (db) =>
    db.select()
      .from(purchases)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(purchases.purchasedAt))
      .limit(limit)
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
      db.insert(purchases).values({
        purchaseProductId: body.purchaseProductId ?? null,
        productName: body.productName,
        value: body.value,
        description: body.description,
        purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : new Date(),
        registeredBy: session.sub,
      }).returning()
    )
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
