import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, products, taxRates } from '@/lib/db/schema/tenant'
import { calcItemTotal, calcOrderTotals } from '@/lib/order-calc'

// POST /api/tenant/orders/[id]/items
// Legacy endpoint — canonical logic is PATCH action=add_items on [id]/route.ts.
// This endpoint delegates to the same full recalculation so both code paths
// produce identical results.
const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
  modifiers: z.array(z.object({
    groupName: z.string(),
    modifierName: z.string(),
    priceDelta: z.number(),
  })).default([]),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  try {
    const body = addItemSchema.parse(await req.json())

    await withTenant(tenant.schemaName, async (db) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1)
      if (!order || ['closed', 'cancelled'].includes(order.status)) {
        throw new Error('Order not editable')
      }

      const [prod] = await db.select().from(products).where(eq(products.id, body.productId)).limit(1)
      if (!prod) throw new Error('Product not found')

      const unitPrice = parseFloat(prod.price)
      const cartItem = {
        id: 'new-0',
        productId: body.productId,
        productName: prod.name,
        unitPrice,
        quantity: body.quantity,
        modifiers: body.modifiers,
        notes: body.notes ?? '',
      }
      const itemTotal = calcItemTotal(cartItem)

      await db.insert(orderItems).values({
        orderId: params.id,
        productId: body.productId,
        productSnapshot: { name: prod.name, price: prod.price },
        quantity: body.quantity,
        unitPrice: String(unitPrice),
        modifierSnapshot: body.modifiers.map((m) => ({ ...m, priceDelta: String(m.priceDelta) })),
        modifiersTotal: String(body.modifiers.reduce((s, m) => s + m.priceDelta, 0)),
        itemTotal: String(itemTotal),
        notes: body.notes,
        status: 'pending',
      })

      // Recalculate using canonical calcOrderTotals (same as PATCH add_items)
      const allTaxes = await db.select().from(taxRates)
      const taxMap = Object.fromEntries(allTaxes.map((t) => [t.id, t]))

      const addedTotals = calcOrderTotals([cartItem], [{
        id: prod.id,
        taxRateId: prod.taxRateId ?? null,
        taxRate: prod.taxRateId ? parseFloat(taxMap[prod.taxRateId]?.rate ?? '0') : null,
        taxName: prod.taxRateId ? taxMap[prod.taxRateId]?.name ?? null : null,
      }], { deliveryFee: 0 })

      // Merge tax breakdown
      const existingTax = (order.taxBreakdown as { name: string; rate: number; amount: number }[]) ?? []
      const merged: Record<string, { name: string; rate: number; amount: number }> = {}
      for (const tl of existingTax) merged[tl.name] = { ...tl }
      for (const tl of addedTotals.taxLines) {
        merged[tl.name] = merged[tl.name]
          ? { ...merged[tl.name], amount: merged[tl.name].amount + tl.amount }
          : { name: tl.name, rate: tl.rate, amount: tl.amount }
      }

      await db
        .update(orders)
        .set({
          subtotal: String(parseFloat(order.subtotal ?? '0') + addedTotals.subtotal),
          taxAmount: String(parseFloat(order.taxAmount ?? '0') + addedTotals.taxTotal),
          taxBreakdown: Object.values(merged),
          total: String(parseFloat(order.total ?? '0') + addedTotals.total),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, params.id))
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
