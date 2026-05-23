import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables } from '@/lib/db/schema/tenant'

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  capacity: z.number().int().min(1).optional(),
  zone: z.string().optional(),
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']).optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  try {
    const data = updateSchema.parse(await req.json())
    const [updated] = await withTenant(tenant.schemaName, async (db) =>
      db.update(tables).set(data).where(eq(tables.id, params.id)).returning()
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
    db.update(tables).set({ isActive: false }).where(eq(tables.id, params.id))
  )
  return NextResponse.json({ ok: true })
}
