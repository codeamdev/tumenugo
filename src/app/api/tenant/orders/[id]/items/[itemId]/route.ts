import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems } from '@/lib/db/schema/tenant'

// DELETE /api/tenant/orders/[id]/items/[itemId]
// Marks a single item as cancelled and recalculates the order total.
// The order must not be closed or cancelled.
export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const session = await requireTenantSession()
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

    // Recalculate totals from non-cancelled items only
    const activeItems = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, params.id), ne(orderItems.status, 'cancelled')))

    const newSubtotal = activeItems.reduce((s, i) => s + parseFloat(i.itemTotal ?? '0'), 0)
    const newTaxAmount = activeItems.reduce((s, i) => {
      // itemTotal already includes the item's portion; tax was embedded. Re-use existing ratio.
      return s
    }, parseFloat(order.taxAmount ?? '0'))

    // Simpler: keep tax proportional — subtract cancelled item's contribution
    const cancelledItemTotal = parseFloat(item.itemTotal ?? '0')
    const prevTotal = parseFloat(order.total ?? '0')
    const prevSubtotal = parseFloat(order.subtotal ?? '0')
    const prevTax = parseFloat(order.taxAmount ?? '0')
    const taxRatio = prevSubtotal > 0 ? prevTax / prevSubtotal : 0
    const newSub = Math.max(0, prevSubtotal - cancelledItemTotal)
    const newTax = Math.round(newSub * taxRatio * 100) / 100
    const newTotal = Math.max(0, prevTotal - cancelledItemTotal - (prevTax - newTax))

    await db
      .update(orders)
      .set({
        subtotal: String(Math.round(newSub * 100) / 100),
        taxAmount: String(newTax),
        total: String(Math.round(newTotal * 100) / 100),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, params.id))

    return 'ok'
  })

  if (result === 'not_found')       return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (result === 'locked')          return NextResponse.json({ error: 'El pedido está cerrado o cancelado' }, { status: 422 })
  if (result === 'item_not_found')  return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
  if (result === 'already_cancelled') return NextResponse.json({ error: 'El ítem ya está cancelado' }, { status: 422 })

  return NextResponse.json({ ok: true })
}
