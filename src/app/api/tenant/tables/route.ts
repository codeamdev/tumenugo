import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc, and, inArray } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables, orders } from '@/lib/db/schema/tenant'

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

  const data = await withTenant(tenant.schemaName, async (db) => {
    const rows = await db.select().from(tables).where(eq(tables.isActive, true)).orderBy(asc(tables.name))
    if (rows.length === 0) return []

    // Compute which tables have active (unpaid) orders
    const tableIds = rows.map((t) => t.id)
    const activeOrders = await db
      .select({ tableId: orders.tableId })
      .from(orders)
      .where(and(
        inArray(orders.tableId, tableIds),
        inArray(orders.status, ['new', 'sent', 'preparing', 'ready', 'delivered']),
      ))
    const occupiedIds = new Set(activeOrders.map((o) => o.tableId).filter(Boolean))

    return rows.map((t) => ({
      ...t,
      isBar: t.zone === 'Barra',
      status: t.zone === 'Barra'
        ? 'available'
        : occupiedIds.has(t.id)
          ? 'occupied'
          : t.status === 'occupied' ? 'available' : t.status,
    }))
  })

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
