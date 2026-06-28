import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, desc, and, ne, inArray, notInArray, sql, gte, lt } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, products, tables, taxRates } from '@/lib/db/schema/tenant'
import { calcOrderTotals, calcItemTotal } from '@/lib/order-calc'
import { randomUUID } from 'crypto'

const itemSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  customName: z.string().optional(),
  customPrice: z.number().min(0).optional(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
  modifiers: z.array(z.object({
    groupName: z.string(),
    modifierName: z.string(),
    priceDelta: z.number(),
  })).default([]),
})

const createSchema = z.object({
  type: z.enum(['table', 'bar', 'delivery']),
  tableId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  customerNotes: z.string().optional(),
  deliveryFee: z.number().default(0),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
  localId: z.string().uuid().optional(),
  // Si true, el pedido se crea directamente en estado 'sent' (va a cocina al instante)
  sendToKitchen: z.boolean().default(false),
})

const ORDER_STATUSES = ['new', 'sent', 'preparing', 'ready', 'delivered', 'closed', 'cancelled'] as const
type OrderStatusValue = typeof ORDER_STATUSES[number]

export async function GET(request: NextRequest) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()
  const { searchParams } = new URL(request.url)
  const rawStatus = searchParams.get('status')

  // Validate status param before passing to DB to return 400 instead of 500
  if (rawStatus && !(ORDER_STATUSES as readonly string[]).includes(rawStatus)) {
    return NextResponse.json({ error: `Estado inválido: ${rawStatus}` }, { status: 400 })
  }
  const status = rawStatus as OrderStatusValue | null

  const historial = searchParams.get('historial') === 'true'

  const data = await withTenant(tenant.schemaName, async (db) => {
    const orderList = historial
      ? await db.select().from(orders).where(inArray(orders.status, ['closed', 'cancelled'] as any[])).orderBy(desc(orders.createdAt))
      : status
        ? await db.select().from(orders).where(eq(orders.status, status)).orderBy(desc(orders.createdAt))
        : await db.select().from(orders).where(and(ne(orders.status, 'closed'), ne(orders.status, 'cancelled'))).orderBy(desc(orders.createdAt))

    // Sync table status: free any occupied table with no active order
    const activeTableIds = orderList.map((o) => o.tableId).filter(Boolean) as string[]
    if (activeTableIds.length > 0) {
      await db.update(tables).set({ status: 'available' }).where(
        and(eq(tables.status, 'occupied'), notInArray(tables.id, activeTableIds))
      )
    } else {
      await db.update(tables).set({ status: 'available' }).where(eq(tables.status, 'occupied'))
    }

    if (orderList.length === 0) return []

    // Resolve table names in a single query
    const tableIds = Array.from(new Set(orderList.map((o) => o.tableId).filter(Boolean) as string[]))
    let tableNameMap: Record<string, string> = {}
    if (tableIds.length > 0) {
      const tableRows = await db.select({ id: tables.id, name: tables.name }).from(tables).where(inArray(tables.id, tableIds))
      tableNameMap = Object.fromEntries(tableRows.map((t) => [t.id, t.name]))
    }

    const counts = await db
      .select({ orderId: orderItems.orderId, count: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderList.map((o) => o.id)))
      .groupBy(orderItems.orderId)

    const countMap = Object.fromEntries(counts.map((c) => [c.orderId, c.count]))
    return orderList.map((o) => ({
      ...o,
      tableName: o.tableId ? (tableNameMap[o.tableId] ?? null) : null,
      itemsCount: countMap[o.id] ?? 0,
    }))
  })

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  const tenant = await requireActiveTenant()

  try {
    const body = await request.json()
    const input = createSchema.parse(body)

    const result = await withTenant(tenant.schemaName, async (db) => {
      // Idempotency: if this localId was already synced, return the existing order
      if (input.localId) {
        const [existing] = await db.select().from(orders).where(eq(orders.localId, input.localId)).limit(1)
        if (existing) return existing
      }

      // Fetch all real products in the order (skip custom items)
      const productIds = Array.from(new Set(
        input.items.filter((i) => i.productId).map((i) => i.productId!)
      ))
      const allProds: (typeof products.$inferSelect)[] = []
      for (const pid of productIds) {
        const [p] = await db.select().from(products).where(eq(products.id, pid)).limit(1)
        if (p) allProds.push(p)
      }

      // Fetch tax rates
      const taxes = await db.select().from(taxRates)
      const taxMap = Object.fromEntries(taxes.map((t) => [t.id, t]))

      // Build cart items for calculation
      const cartItems = input.items.map((item, idx) => {
        const prod = item.productId ? allProds.find((p) => p.id === item.productId) : null
        const unitPrice = item.productId
          ? parseFloat(prod?.price ?? '0')
          : (item.customPrice ?? 0)
        return {
          id: `item-${idx}`,
          productId: item.productId ?? null,
          productName: '',
          unitPrice,
          quantity: item.quantity,
          modifiers: item.modifiers.map((m) => ({
            groupName: m.groupName,
            modifierName: m.modifierName,
            priceDelta: m.priceDelta,
          })),
          notes: item.notes ?? '',
        }
      })

      const prodsForCalc = allProds.map((p) => ({
        id: p.id,
        taxRateId: p.taxRateId ?? null,
        taxRate: p.taxRateId ? parseFloat(taxMap[p.taxRateId]?.rate ?? '0') : null,
        taxName: p.taxRateId ? taxMap[p.taxRateId]?.name : null,
      }))

      const totals = calcOrderTotals(cartItems, prodsForCalc, {
        deliveryFee: input.deliveryFee,
      })

      // Generate daily consecutive display code: PED-001 or DOM-001
      const prefix = input.type === 'delivery' ? 'DOM' : 'PED'
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const [countRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            sql`display_code LIKE ${prefix + '-%'}`,
            gte(orders.createdAt, todayStart),
            lt(orders.createdAt, todayEnd),
          )
        )
      const nextNum = (countRow?.n ?? 0) + 1
      const displayCode = `${prefix}-${String(nextNum).padStart(3, '0')}`

      // Create order
      const [order] = await db
        .insert(orders)
        .values({
          localId: input.localId ?? randomUUID(),
          displayCode,
          type: input.type,
          tableId: input.tableId,
          status: input.sendToKitchen ? 'sent' : 'new',
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerAddress: input.customerAddress,
          customerNotes: input.customerNotes,
          deliveryFee: String(totals.deliveryFee),
          subtotal: String(totals.subtotal),
          taxBreakdown: totals.taxLines,
          taxAmount: String(totals.taxTotal),
          total: String(totals.total),
          notes: input.notes,
          servedBy: session.sub,
        })
        .returning()

      // Mark table as occupied
      if (input.tableId) {
        await db
          .update(tables)
          .set({ status: 'occupied' })
          .where(eq(tables.id, input.tableId))
      }

      // Create order items
      for (const item of input.items) {
        const prod = item.productId ? allProds.find((p) => p.id === item.productId) : null
        const cartItem = cartItems[input.items.indexOf(item)]
        const itemTotal = calcItemTotal(cartItem)
        const modifiersTotal = item.modifiers.reduce((s, m) => s + m.priceDelta, 0)
        const unitPrice = item.productId
          ? parseFloat(prod?.price ?? '0')
          : (item.customPrice ?? 0)

        await db.insert(orderItems).values({
          orderId: order.id,
          productId: item.productId ?? null,
          productSnapshot: {
            name: prod?.name ?? item.customName ?? '',
            price: prod?.price ?? String(item.customPrice ?? 0),
          },
          quantity: item.quantity,
          unitPrice: String(unitPrice),
          modifierSnapshot: item.modifiers.map((m) => ({ ...m, priceDelta: String(m.priceDelta) })),
          modifiersTotal: String(modifiersTotal),
          itemTotal: String(itemTotal),
          notes: item.notes,
          status: 'pending',
        })
      }

      return order
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error('Create order error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
