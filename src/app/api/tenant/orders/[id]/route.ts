import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, tables, cashRegisters, cashRegisterEntries, products, taxRates } from '@/lib/db/schema/tenant'
import { calcOrderTotals, calcItemTotal } from '@/lib/order-calc'
import { apiError } from '@/lib/debug'
import { toDbMethod, getCreditMethodKeys } from '@/lib/payment-methods'

const updateSchema = z.object({
  status: z.enum(['new', 'sent', 'preparing', 'ready', 'delivered', 'closed', 'cancelled']).optional(),
  cancelReason: z.string().optional(),
  notes: z.string().optional(),
})

const addItemSchema = z.object({
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

const addItemsSchema = z.object({
  items: z.array(addItemSchema).min(1),
})

const closeSchema = z.object({
  payments: z.array(z.object({
    method: z.string(),
    amount: z.number().min(0),
  })).default([]),
  // Formato legado de close-order-modal (método único sin monto explícito)
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  tipAmount: z.number().min(0).default(0),
  // Obligatorio cuando paymentMethod = 'fiado'
  customerName: z.string().optional(),
})

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1)
    if (!order) return null
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, params.id))

    let tableName: string | null = null
    if (order.tableId) {
      const [tbl] = await db.select({ name: tables.name }).from(tables).where(eq(tables.id, order.tableId)).limit(1)
      tableName = tbl?.name ?? null
    }

    return { ...order, tableName, items }
  })

  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession()
  const tenant = await requireActiveTenant()

  try {
    const body = await req.json()

    // Close order flow
    if (body.action === 'close') {
      const closeData = closeSchema.parse(body)

      const updated = await withTenant(tenant.schemaName, async (db) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1)
        if (!order) return null

        const total = parseFloat(order.total ?? '0') + closeData.tipAmount

        // Normalizar pagos: soporta formato legado (paymentMethod único) y nuevo (payments[])
        let validPayments = closeData.payments.filter((p) => p.amount > 0)
        if (validPayments.length === 0 && closeData.paymentMethod) {
          validPayments = [{ method: closeData.paymentMethod, amount: total }]
        }

        const creditKeys = getCreditMethodKeys(tenant.posConfig)
        const isCredit = validPayments.length > 0 && creditKeys.has(validPayments[0].method)

        // Crédito: nombre del cliente y observación son obligatorios
        if (isCredit) {
          const hasName = closeData.customerName?.trim() || order.customerName
          if (!hasName) return 'CREDIT_NAME_REQUIRED' as const
          if (!closeData.paymentNotes?.trim()) return 'CREDIT_NOTES_REQUIRED' as const
        }

        const totalReceived = isCredit ? 0 : validPayments.reduce((s, p) => s + p.amount, 0)
        const changeGiven = isCredit ? 0 : Math.max(0, totalReceived - total)
        const primaryMethod = validPayments.length > 0 ? toDbMethod(validPayments[0].method) : 'other'

        const [updated] = await db
          .update(orders)
          .set({
            status: 'closed',
            paymentStatus: isCredit ? 'pending' : 'paid',
            paymentMethod: primaryMethod,
            paymentNotes: closeData.paymentNotes,
            customerName: isCredit && closeData.customerName?.trim()
              ? closeData.customerName.trim()
              : order.customerName,
            cashReceived: null,
            changeGiven: String(changeGiven),
            tipAmount: String(closeData.tipAmount),
            closedBy: session.sub,
            closedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, params.id))
          .returning()

        // Free the table
        if (updated.tableId) {
          await db
            .update(tables)
            .set({ status: 'available' })
            .where(eq(tables.id, updated.tableId))
        }

        // Ensure a cash register is open
        let [openRegister] = await db
          .select()
          .from(cashRegisters)
          .where(eq(cashRegisters.status, 'open'))
          .orderBy(desc(cashRegisters.openedAt))
          .limit(1)

        if (!openRegister) {
          const defaultAmount = tenant.posConfig?.defaultOpeningAmount ?? 0
          ;[openRegister] = await db
            .insert(cashRegisters)
            .values({
              openedBy: session.sub,
              openingAmount: String(defaultAmount),
              status: 'open',
              openedAt: updated.closedAt ?? new Date(),
            })
            .returning()
        }

        // Crédito NO genera entrada de caja (no hay dinero recibido)
        if (openRegister && !isCredit) {
          for (const payment of validPayments) {
            const dbMethod = toDbMethod(payment.method)
            await db.insert(cashRegisterEntries).values({
              registerId: openRegister.id,
              orderId: updated.id,
              type: 'sale',
              amount: String(payment.amount),
              paymentMethod: dbMethod,
              notes: payment.method !== dbMethod ? payment.method : closeData.paymentNotes,
            })
          }
        }

        return updated
      })

      if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      if (updated === 'CREDIT_NAME_REQUIRED')
        return NextResponse.json({ error: 'El nombre del cliente es obligatorio para pagos pendientes' }, { status: 422 })
      if (updated === 'CREDIT_NOTES_REQUIRED')
        return NextResponse.json({ error: 'La observación del pago es obligatoria para pagos pendientes' }, { status: 422 })
      return NextResponse.json({ data: updated })
    }

    // Add items to existing order
    if (body.action === 'add_items') {
      const addData = addItemsSchema.parse(body)

      const result = await withTenant(tenant.schemaName, async (db) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1)
        if (!order) return null
        if (order.status === 'closed' || order.status === 'cancelled') return 'locked'

        const productIds = Array.from(new Set(
          addData.items.filter((i) => i.productId).map((i) => i.productId!)
        ))
        const allProds: (typeof products.$inferSelect)[] = []
        for (const pid of productIds) {
          const [p] = await db.select().from(products).where(eq(products.id, pid)).limit(1)
          if (p) allProds.push(p)
        }

        const taxes = await db.select().from(taxRates)
        const taxMap = Object.fromEntries(taxes.map((t) => [t.id, t]))

        const cartItems = addData.items.map((item, idx) => {
          const prod = item.productId ? allProds.find((p) => p.id === item.productId) : null
          const unitPrice = item.productId ? parseFloat(prod?.price ?? '0') : (item.customPrice ?? 0)
          return {
            id: `new-${idx}`,
            productId: item.productId ?? null,
            productName: '',
            unitPrice,
            quantity: item.quantity,
            modifiers: item.modifiers,
            notes: item.notes ?? '',
          }
        })

        const prodsForCalc = allProds.map((p) => ({
          id: p.id,
          taxRateId: p.taxRateId ?? null,
          taxRate: p.taxRateId ? parseFloat(taxMap[p.taxRateId]?.rate ?? '0') : null,
          taxName: p.taxRateId ? taxMap[p.taxRateId]?.name : null,
        }))

        const addedTotals = calcOrderTotals(cartItems, prodsForCalc, { deliveryFee: 0 })

        for (const item of addData.items) {
          const prod = item.productId ? allProds.find((p) => p.id === item.productId) : null
          const cartItem = cartItems[addData.items.indexOf(item)]
          const itemTotal = calcItemTotal(cartItem)
          const unitPrice = item.productId ? parseFloat(prod?.price ?? '0') : (item.customPrice ?? 0)
          await db.insert(orderItems).values({
            orderId: order.id,
            productId: item.productId ?? null,
            productSnapshot: { name: prod?.name ?? item.customName ?? '', price: prod?.price ?? String(item.customPrice ?? 0) },
            quantity: item.quantity,
            unitPrice: String(unitPrice),
            modifierSnapshot: item.modifiers.map((m) => ({ ...m, priceDelta: String(m.priceDelta) })),
            modifiersTotal: String(item.modifiers.reduce((s, m) => s + m.priceDelta, 0)),
            itemTotal: String(itemTotal),
            notes: item.notes,
            status: 'pending',
          })
        }

        // Merge tax breakdown
        const existingTax = (order.taxBreakdown as { name: string; rate: number; amount: number }[]) ?? []
        const merged: Record<string, { name: string; rate: number; amount: number }> = {}
        for (const tl of existingTax) merged[tl.name] = { ...tl }
        for (const tl of addedTotals.taxLines) {
          merged[tl.name] = merged[tl.name]
            ? { ...merged[tl.name], amount: merged[tl.name].amount + tl.amount }
            : { ...tl }
        }

        const newSubtotal = parseFloat(order.subtotal ?? '0') + addedTotals.subtotal
        const newTaxAmount = parseFloat(order.taxAmount ?? '0') + addedTotals.taxTotal
        // Use addedTotals.total (not subtotal+taxTotal separately) so tip/delivery
        // contributions from new items are included correctly if ever added.
        const newTotal = parseFloat(order.total ?? '0') + addedTotals.total

        const [updatedOrder] = await db
          .update(orders)
          .set({
            subtotal: String(newSubtotal),
            taxAmount: String(newTaxAmount),
            taxBreakdown: Object.values(merged),
            total: String(newTotal),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, params.id))
          .returning()

        return updatedOrder
      })

      if (result === null) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      if (result === 'locked') return NextResponse.json({ error: 'No se pueden agregar productos a un pedido cerrado o cancelado' }, { status: 422 })
      return NextResponse.json({ data: result })
    }

    // Status update
    const data = updateSchema.parse(body)
    const updated = await withTenant(tenant.schemaName, async (db) => {
      const [order] = await db
        .update(orders)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(orders.id, params.id))
        .returning()

      // Free the table when cancelled
      if (order && data.status === 'cancelled' && order.tableId) {
        await db.update(tables).set({ status: 'available' }).where(eq(tables.id, order.tableId))
      }

      return order
    })

    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: apiError(err) }, { status: 500 })
  }
}
