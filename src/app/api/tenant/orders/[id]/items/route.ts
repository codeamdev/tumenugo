import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, products } from '@/lib/db/schema/tenant'
import { calcItemTotal } from '@/lib/order-calc'

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
      const modifiersTotal = body.modifiers.reduce((s, m) => s + m.priceDelta, 0)
      const itemTotal = Math.round((unitPrice + modifiersTotal) * body.quantity * 100) / 100

      await db.insert(orderItems).values({
        orderId: params.id,
        productId: body.productId,
        productSnapshot: { name: prod.name, price: prod.price },
        quantity: body.quantity,
        unitPrice: String(unitPrice),
        modifierSnapshot: body.modifiers.map((m) => ({ ...m, priceDelta: String(m.priceDelta) })),
        modifiersTotal: String(modifiersTotal),
        itemTotal: String(itemTotal),
        notes: body.notes,
        status: 'pending',
      })

      // Recalculate order subtotal
      const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, params.id))
      const newSubtotal = allItems.reduce((s, i) => s + parseFloat(i.itemTotal), 0)
      await db
        .update(orders)
        .set({
          subtotal: String(Math.round(newSubtotal * 100) / 100),
          total: String(Math.round(newSubtotal * 100) / 100),
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
