import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  name: z.string().min(1).max(50),
  capacity: z.number().int().min(1).default(4),
  isBar: z.boolean().default(false),
  posX: z.number().default(0),
  posY: z.number().default(0),
})

export async function GET() {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const rows = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(tables).where(eq(tables.isActive, true)).orderBy(asc(tables.name))
  )

  const data = rows.map((t) => ({
    ...t,
    isBar: t.zone === 'Barra',
    // Bar tables always show as available regardless of stored status
    status: t.zone === 'Barra' ? 'available' : t.status,
  }))

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const tenant = await requireActiveTenant()

  try {
    const { isBar, ...rest } = createSchema.parse(await request.json())
    const [created] = await withTenant(tenant.schemaName, async (db) =>
      db.insert(tables).values({ ...rest, zone: isBar ? 'Barra' : 'Salón' }).returning()
    )
    return NextResponse.json({ data: { ...created, isBar } }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
