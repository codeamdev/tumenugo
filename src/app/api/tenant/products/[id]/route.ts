import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { products } from '@/lib/db/schema/tenant'

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  categoryId: z.string().uuid().optional(),
  taxRateId: z.string().uuid().optional().nullable(),
  prepTimeMin: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().url().optional().nullable(),
})

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const [product] = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(products).where(eq(products.id, params.id)).limit(1)
  )
  if (!product) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ data: product })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const data = updateSchema.parse(await req.json())
    const [updated] = await withTenant(tenant.schemaName, async (db) =>
      db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, params.id)).returning()
    )
    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const tenant = await requireActiveTenant()

  await withTenant(tenant.schemaName, async (db) =>
    db.update(products).set({ isAvailable: false }).where(eq(products.id, params.id))
  )
  return NextResponse.json({ ok: true })
}
