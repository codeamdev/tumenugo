import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, products, taxRates } from '@/lib/db/schema/tenant'
import { calcItemTotal, calcOrderTotals } from '@/lib/order-calc'
import type { ProductSnapshot } from '@/lib/db/schema/tenant'

// DELETE /api/tenant/orders/[id]/items/[itemId]
// Marks a single item as cancelled and recalculates the order total from scratch.
export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const result = await withTenant(tenant.schemaName, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1)
    if (!order) return 'not_found'
    if (order.status === 'closed' || order.status === 'cancelled') return 'locked'

    const [item] = await db.select().from(orderItems).where(
      and(eq(orderItems.id, params.itemId), eq(orderItems.orderId, params.id))
    ).limit(1)
    if (!item) return 'item_not_found'
    if (item.status === 'cancelled') return 'already_cancelled'

    await db
      .update(orderItems)
      .set({ status: 'cancelled' })
      .where(eq(orderItems.id, params.itemId))

    // Recalculate totals correctly from all remaining active items.
    // Fetch per-item tax rates from the products table to avoid the average-ratio bug.
    const activeItems = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, params.id), ne(orderItems.status, 'cancelled')))

    const productIds = Array.from(new Set(activeItems.map((i) => i.productId).filter(Boolean) as string[]))

    const prodMap: Record<string, typeof products.$inferSelect> = {}
    for (const pid of productIds) {
      const [p] = await db.select().from(products).where(eq(products.id, pid)).limit(1)
      if (p) prodMap[pid] = p
    }

    const allTaxes = await db.select().from(taxRates)
    const taxMap = Object.fromEntries(allTaxes.map((t) => [t.id, t]))

    // Build CalcItems from stored order items so calcOrderTotals produces exact totals.
    const calcItems = activeItems.map((i, idx) => {
      const snap = i.modifierSnapshot as Array<{ groupName: string; modifierName: string; priceDelta: string }> | null
      return {
        id: `item-${idx}`,
        productId: i.productId ?? null,
        productName: (i.productSnapshot as ProductSnapshot)?.name ?? '',
        unitPrice: parseFloat(i.unitPrice ?? '0'),
        quantity: i.quantity,
        modifiers: (snap ?? []).map((m) => ({ ...m, priceDelta: parseFloat(m.priceDelta) })),
        notes: i.notes ?? '',
      }
    })

    const prodsForCalc = Object.values(prodMap).map((p) => ({
      id: p.id,
      taxRateId: p.taxRateId ?? null,
      taxRate: p.taxRateId ? parseFloat(taxMap[p.taxRateId]?.rate ?? '0') : null,
      taxName: p.taxRateId ? taxMap[p.taxRateId]?.name ?? null : null,
    }))

    // Preserve existing tip and deliveryFee since we're only cancelling an item
    const prevTip = parseFloat(order.tipAmount ?? '0')
    const prevDeliveryFee = parseFloat(order.deliveryFee ?? '0')
    const prevDiscount = parseFloat(order.discountAmount ?? '0')

    const recalc = calcOrderTotals(calcItems, prodsForCalc, {
      couponDiscount: prevDiscount,
      deliveryFee: prevDeliveryFee,
    })
    // Re-apply tip as absolute amount (not percent) since we stored it as amount
    const newTotal = Math.max(0, recalc.total + prevTip)

    await db
      .update(orders)
      .set({
        subtotal: String(recalc.subtotal),
        taxAmount: String(recalc.taxTotal),
        taxBreakdown: recalc.taxLines.map((l) => ({ name: l.name, rate: l.rate, amount: l.amount })),
        total: String(newTotal),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, params.id))

    return 'ok'
  })

  if (result === 'not_found')         return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (result === 'locked')            return NextResponse.json({ error: 'El pedido está cerrado o cancelado' }, { status: 422 })
  if (result === 'item_not_found')    return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
  if (result === 'already_cancelled') return NextResponse.json({ error: 'El ítem ya está cancelado' }, { status: 422 })

  return NextResponse.json({ ok: true })
}
