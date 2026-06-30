import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, desc, gte, inArray } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import {
  cashRegisters,
  cashRegisterEntries,
  orders,
} from '@/lib/db/schema/tenant'

import { buildMethodLabels } from '@/lib/payment-methods'
import type { PosConfig } from '@/lib/db/schema/public'

const openSchema = z.object({
  action: z.literal('open'),
  openingAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
})

const closeSchema = z.object({
  action: z.literal('close'),
  countedCash: z.number().min(0),
  notes: z.string().optional(),
})

// GET /api/tenant/caja — returns current open register + summary + history
export async function GET(_: NextRequest) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const methodLabels = buildMethodLabels(tenant.posConfig as PosConfig | null)

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [register] = await db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.status, 'open'))
      .orderBy(desc(cashRegisters.openedAt))
      .limit(1)

    const history = await db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.status, 'closed'))
      .orderBy(desc(cashRegisters.closedAt))
      .limit(10)

    const serialise = (r: typeof register) => r ? {
      ...r,
      openedAt: r.openedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
    } : null

    if (!register) {
      return { register: null, summary: null, history: history.map(serialise) }
    }

    const closedOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.status, 'closed'), gte(orders.closedAt, register.openedAt!)))

    const byMethod: Record<string, number> = {}
    let totalTips = 0
    for (const o of closedOrders) totalTips += parseFloat(o.tipAmount ?? '0')

    if (closedOrders.length > 0) {
      const orderIds = closedOrders.map((o) => o.id)
      const entries = await db
        .select({ paymentMethod: cashRegisterEntries.paymentMethod, amount: cashRegisterEntries.amount, notes: cashRegisterEntries.notes, orderId: cashRegisterEntries.orderId })
        .from(cashRegisterEntries)
        .where(and(inArray(cashRegisterEntries.orderId, orderIds), eq(cashRegisterEntries.type, 'sale')))

      // Agrupar por pedido para escalar al total del pedido (no al monto recibido)
      const entriesByOrder: Record<string, typeof entries> = {}
      for (const e of entries) {
        if (!entriesByOrder[e.orderId!]) entriesByOrder[e.orderId!] = []
        entriesByOrder[e.orderId!].push(e)
      }
      const withEntries = new Set<string>()
      for (const o of closedOrders) {
        const orderEntries = entriesByOrder[o.id]
        if (!orderEntries?.length) continue
        withEntries.add(o.id)
        const orderTotal = parseFloat(o.total ?? '0')
        const rawTotal   = orderEntries.reduce((s, e) => s + parseFloat(e.amount ?? '0'), 0)
        for (const e of orderEntries) {
          const isCustomKey = e.paymentMethod === 'other' && e.notes && methodLabels[e.notes] !== undefined
          const key   = isCustomKey ? e.notes! : (e.paymentMethod ?? 'other')
          const ratio = rawTotal > 0 ? parseFloat(e.amount ?? '0') / rawTotal : 1 / orderEntries.length
          byMethod[key] = (byMethod[key] ?? 0) + orderTotal * ratio
        }
      }
      for (const o of closedOrders) {
        if (!withEntries.has(o.id)) {
          const m = o.paymentMethod ?? 'other'
          byMethod[m] = (byMethod[m] ?? 0) + parseFloat(o.total ?? '0')
        }
      }
    }

    const expectedCash = parseFloat(register.openingAmount ?? '0') + (byMethod['cash'] ?? 0)

    return {
      register: serialise(register),
      summary: {
        totalOrders: closedOrders.length,
        totalSales: closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0),
        totalTips,
        byPaymentMethod: byMethod,
        expectedCash,
      },
      history: history.map(serialise),
    }
  })

  return NextResponse.json({
    data: { ...data, currencySign: tenant.currencySign ?? '$', paymentMethodLabels: methodLabels }
  })
}

// POST /api/tenant/caja — open or close register (admin/cajero only)
export async function POST(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body = await req.json()

    if (body.action === 'open') {
      const input = openSchema.parse(body)

      const result = await withTenant(tenant.schemaName, async (db) => {
        // Ensure no register is already open
        const [existing] = await db
          .select()
          .from(cashRegisters)
          .where(eq(cashRegisters.status, 'open'))
          .limit(1)

        if (existing) {
          throw new Error('Ya hay una caja abierta')
        }

        const [register] = await db
          .insert(cashRegisters)
          .values({
            openedBy: session.sub,
            openingAmount: String(input.openingAmount),
            notes: input.notes,
            status: 'open',
          })
          .returning()

        return register
      })

      return NextResponse.json({ data: result }, { status: 201 })
    }

    if (body.action === 'close') {
      const input = closeSchema.parse(body)

      const result = await withTenant(tenant.schemaName, async (db) => {
        const [register] = await db
          .select()
          .from(cashRegisters)
          .where(eq(cashRegisters.status, 'open'))
          .orderBy(desc(cashRegisters.openedAt))
          .limit(1)

        if (!register) throw new Error('No hay caja abierta')

        const closedOrders = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.status, 'closed'),
              gte(orders.closedAt, register.openedAt!)
            )
          )

        const cashSales = closedOrders
          .filter((o) => o.paymentMethod === 'cash')
          .reduce((s, o) => s + parseFloat(o.total ?? '0'), 0)

        const expectedCash =
          parseFloat(register.openingAmount ?? '0') + cashSales

        const difference = input.countedCash - expectedCash

        const [closed] = await db
          .update(cashRegisters)
          .set({
            closedBy: session.sub,
            closedAt: new Date(),
            expectedCash: String(expectedCash),
            countedCash: String(input.countedCash),
            difference: String(difference),
            notes: input.notes ?? register.notes,
            status: 'closed',
          })
          .where(eq(cashRegisters.id, register.id))
          .returning()

        return closed
      })

      return NextResponse.json({ data: result })
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    if (err instanceof Error && (err.message.includes('Ya hay') || err.message.includes('No hay'))) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('Caja error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
