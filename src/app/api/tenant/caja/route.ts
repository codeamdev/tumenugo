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
  countedByMethod: z.record(z.number().min(0)).optional(),
  countedCash: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// GET /api/tenant/caja — returns current open register + summary + history
// ?type=history returns up to 100 closings (for the informe de cierres page)
export async function GET(req: NextRequest) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const url = new URL(req.url)
  const historyLimit = url.searchParams.get('type') === 'history' ? 100 : 10

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
      .limit(historyLimit)

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
      .where(and(eq(orders.status, 'closed'), eq(orders.paymentStatus, 'paid'), gte(orders.closedAt, register.openedAt!)))

    const byMethod: Record<string, number> = {}
    let totalTips = 0
    for (const o of closedOrders) totalTips += parseFloat(o.tipAmount ?? '0')

    if (closedOrders.length > 0) {
      const orderIds = closedOrders.map((o) => o.id)
      const entries = await db
        .select({ paymentMethod: cashRegisterEntries.paymentMethod, amount: cashRegisterEntries.amount, notes: cashRegisterEntries.notes, orderId: cashRegisterEntries.orderId })
        .from(cashRegisterEntries)
        .where(and(inArray(cashRegisterEntries.orderId, orderIds), eq(cashRegisterEntries.type, 'sale')))

      // Group by order; cap each entry to remaining total (small amounts first)
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
        let remaining = orderTotal
        const sorted = [...orderEntries].sort((a, b) => parseFloat(a.amount ?? '0') - parseFloat(b.amount ?? '0'))
        for (const e of sorted) {
          const isCustomKey = e.paymentMethod === 'other' && typeof e.notes === 'string' && /^[\w-]+$/.test(e.notes)
          const key = isCustomKey ? e.notes! : (e.paymentMethod ?? 'other')
          const capped = Math.min(parseFloat(e.amount ?? '0'), remaining)
          remaining -= capped
          if (capped > 0) byMethod[key] = (byMethod[key] ?? 0) + capped
        }
      }
      for (const o of closedOrders) {
        if (!withEntries.has(o.id)) {
          const m = o.paymentMethod ?? 'other'
          byMethod[m] = (byMethod[m] ?? 0) + parseFloat(o.total ?? '0')
        }
      }
    }

    // expectedCash = solo ventas en efectivo (base excluida de métricas)
    const expectedCash = byMethod['cash'] ?? 0

    return {
      register: serialise(register),
      summary: {
        totalOrders: closedOrders.length,
        totalSales: closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0),
        totalTips,
        byPaymentMethod: byMethod,
        expectedCash,
        openingAmount: parseFloat(register.openingAmount ?? '0'),
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

        // Block close if there are unpaid/open orders in this shift
        const openOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              inArray(orders.status, ['new', 'sent', 'preparing', 'ready', 'delivered']),
              gte(orders.createdAt, register.openedAt!)
            )
          )
        if (openOrders.length > 0) {
          throw new Error(`Hay ${openOrders.length} pedido(s) sin cerrar. Ciérralos o cancélalos antes de cerrar la caja.`)
        }

        const closedOrders = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.status, 'closed'),
              eq(orders.paymentStatus, 'paid'),
              gte(orders.closedAt, register.openedAt!)
            )
          )

        // expectedCash desde entries (igual que la vista de caja abierta)
        const byMethodClose: Record<string, number> = {}
        if (closedOrders.length > 0) {
          const orderIds = closedOrders.map((o) => o.id)
          const allEntries = await db
            .select()
            .from(cashRegisterEntries)
            .where(and(inArray(cashRegisterEntries.orderId, orderIds), eq(cashRegisterEntries.type, 'sale')))
          const entriesByOrder: Record<string, typeof allEntries> = {}
          for (const e of allEntries) {
            if (!entriesByOrder[e.orderId!]) entriesByOrder[e.orderId!] = []
            entriesByOrder[e.orderId!].push(e)
          }
          for (const o of closedOrders) {
            const oe = entriesByOrder[o.id]
            if (!oe?.length) {
              const m = o.paymentMethod ?? 'other'
              byMethodClose[m] = (byMethodClose[m] ?? 0) + parseFloat(o.total ?? '0')
              continue
            }
            let rem = parseFloat(o.total ?? '0')
            const sorted = [...oe].sort((a, b) => parseFloat(a.amount ?? '0') - parseFloat(b.amount ?? '0'))
            for (const e of sorted) {
              const isCustom = e.paymentMethod === 'other' && typeof e.notes === 'string' && /^[\w-]+$/.test(e.notes)
              const key = isCustom ? e.notes! : (e.paymentMethod ?? 'other')
              const capped = Math.min(parseFloat(e.amount ?? '0'), rem)
              rem -= capped
              if (capped > 0) byMethodClose[key] = (byMethodClose[key] ?? 0) + capped
            }
          }
        }
        const expectedCash = byMethodClose['cash'] ?? 0

        const countedCashVal = input.countedByMethod
          ? (input.countedByMethod['cash'] ?? 0)
          : (input.countedCash ?? 0)

        const difference = countedCashVal - expectedCash

        const [closed] = await db
          .update(cashRegisters)
          .set({
            closedBy: session.sub,
            closedAt: new Date(),
            expectedCash: String(expectedCash),
            countedCash: String(countedCashVal),
            difference: String(difference),
            countedByMethod: input.countedByMethod ?? null,
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
    if (err instanceof Error && (err.message.includes('Ya hay') || err.message.includes('No hay') || err.message.includes('Hay '))) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('Caja error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
