import { NextRequest, NextResponse } from 'next/server'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, products, categories, cashRegisterEntries } from '@/lib/db/schema/tenant'
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm'

import { buildMethodLabels } from '@/lib/payment-methods'
import type { PosConfig } from '@/lib/db/schema/public'

function localDateStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Calcula el offset UTC de la timezone dada comparando UTC noon vs local noon.
 * Funciona con cualquier timezone y maneja DST correctamente.
 */
function getTzOffsetMs(dateStr: string, tz: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  // Usamos el mediodía UTC como referencia (evita bordes de DST)
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
  const localStr = noonUTC.toLocaleString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // Puede venir como "07:00" o "24:00" (medianoche)
  const [h, min] = localStr.replace('24', '0').split(':').map(Number)
  return (12 - h) * 3_600_000 - min * 60_000
}

function startOfDay(dateStr: string, tz = 'America/Bogota'): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const offsetMs = getTzOffsetMs(dateStr, tz)
  // Medianoche UTC + offset = medianoche en tz
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs)
}

function endOfDay(dateStr: string, tz = 'America/Bogota'): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const offsetMs = getTzOffsetMs(dateStr, tz)
  // Medianoche UTC + offset + 24h - 1ms = fin del día en tz
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs + 86_400_000 - 1)
}

function dateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz }) // formato YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from') ?? localDateStr()
  const toStr   = searchParams.get('to')   ?? localDateStr()
  const tz  = (tenant as any).timezone ?? 'America/Bogota'
  const from = startOfDay(fromStr, tz)
  const to   = endOfDay(toStr, tz)

  const data = await withTenant(tenant.schemaName, async (db) => {
    // Pedidos cerrados y cobrados en el período
    const closedOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'closed'),
          eq(orders.paymentStatus, 'paid'),
          gte(orders.closedAt, from),
          lte(orders.closedAt, to)
        )
      )
      .orderBy(orders.closedAt)

    // Cuentas por cobrar: todos los pedidos cerrados con pago pendiente (fiado), sin filtro de fecha
    const pendingPayments = await db
      .select({
        id: orders.id,
        closedAt: orders.closedAt,
        total: orders.total,
        customerName: orders.customerName,
        paymentNotes: orders.paymentNotes,
        type: orders.type,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'closed'),
          eq(orders.paymentStatus, 'pending')
        )
      )
      .orderBy(orders.closedAt)

    // KPIs
    const totalSales = closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0)
    const totalOrders = closedOrders.length

    // Sales by payment method — read from cashRegisterEntries to capture split payments
    const byMethod: Record<string, number> = {}

    // Sales by order type
    const byType: Record<string, number> = {}
    for (const o of closedOrders) {
      byType[o.type] = (byType[o.type] ?? 0) + parseFloat(o.total ?? '0')
    }

    // Daily series — usar fecha local del tenant (no UTC) para agrupar correctamente
    const daily: Record<string, number> = {}
    for (const o of closedOrders) {
      if (!o.closedAt) continue
      const day = dateInTz(new Date(o.closedAt), tz)
      daily[day] = (daily[day] ?? 0) + parseFloat(o.total ?? '0')
    }
    const dailySeries = Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sales]) => ({ date, sales }))

    // Top products by quantity
    const orderIds = closedOrders.map((o) => o.id)

    let topProducts: { name: string; qty: number; revenue: number }[] = []
    let byCategory: { name: string; emoji: string | null; revenue: number; qty: number }[] = []
    let lowRotation: { name: string; qty: number }[] = []

    // Build labels before the orderIds block so we can use them for key resolution
    const methodLabels = buildMethodLabels(tenant.posConfig as PosConfig | null)

    if (orderIds.length > 0) {
      // Aggregate payments from cashRegisterEntries (captures split payments)
      const entries = await db
        .select({ paymentMethod: cashRegisterEntries.paymentMethod, amount: cashRegisterEntries.amount, notes: cashRegisterEntries.notes, orderId: cashRegisterEntries.orderId })
        .from(cashRegisterEntries)
        .where(and(inArray(cashRegisterEntries.orderId, orderIds), eq(cashRegisterEntries.type, 'sale')))

      const orderIdsWithEntries = new Set<string>()
      for (const entry of entries) {
        orderIdsWithEntries.add(entry.orderId!)
        // Custom methods: paymentMethod='other', original key stored in notes
        const isCustomKey = entry.paymentMethod === 'other' && entry.notes && methodLabels[entry.notes] !== undefined
        const key = isCustomKey ? entry.notes! : (entry.paymentMethod ?? 'other')
        byMethod[key] = (byMethod[key] ?? 0) + parseFloat(entry.amount ?? '0')
      }

      // Fallback for orders closed before cashRegisterEntries existed
      for (const o of closedOrders) {
        if (!orderIdsWithEntries.has(o.id)) {
          const m = o.paymentMethod ?? 'other'
          byMethod[m] = (byMethod[m] ?? 0) + parseFloat(o.total ?? '0')
        }
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))

      // Top products by qty
      const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {}
      for (const item of items) {
        const name = (item.productSnapshot as any)?.name ?? 'Desconocido'
        if (!prodMap[name]) prodMap[name] = { name, qty: 0, revenue: 0 }
        prodMap[name].qty += item.quantity
        prodMap[name].revenue += parseFloat(item.itemTotal ?? '0')
      }
      topProducts = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 10)

      // Sales by category (join products → categories)
      const itemsWithCat = await db
        .select({
          categoryId: products.categoryId,
          itemTotal: orderItems.itemTotal,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds))

      const cats = await db.select({ id: categories.id, name: categories.name, emoji: categories.emoji }).from(categories)
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c]))

      const catSales: Record<string, { name: string; emoji: string | null; revenue: number; qty: number }> = {}
      for (const item of itemsWithCat) {
        const cat = catMap[item.categoryId]
        const key = cat?.name ?? 'Sin categoría'
        if (!catSales[key]) catSales[key] = { name: key, emoji: cat?.emoji ?? null, revenue: 0, qty: 0 }
        catSales[key].revenue += parseFloat(item.itemTotal ?? '0')
        catSales[key].qty += item.quantity
      }
      byCategory = Object.values(catSales).sort((a, b) => b.revenue - a.revenue)
    }

    // Low rotation: active products with fewer than 5 sales in period
    const allProds = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.isAvailable, true))

    const soldByProductId: Record<string, number> = {}
    if (orderIds.length > 0) {
      const soldQtys = await db
        .select({ productId: orderItems.productId, qty: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .groupBy(orderItems.productId)
      for (const row of soldQtys) if (row.productId) soldByProductId[row.productId] = row.qty
    }

    lowRotation = allProds
      .map((p) => ({ name: p.name, qty: soldByProductId[p.id] ?? 0 }))
      .filter((p) => p.qty < 5)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 20)

    const totalPending = pendingPayments.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0)

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      currencySign: tenant.currencySign ?? '$',
      kpis: { totalSales, totalOrders, totalPending, pendingCount: pendingPayments.length },
      byMethod,
      paymentMethodLabels: methodLabels,
      byType,
      dailySeries,
      topProducts,
      byCategory,
      lowRotation,
      pendingPayments: pendingPayments.map((o) => ({
        id: o.id,
        closedAt: o.closedAt?.toISOString() ?? null,
        total: parseFloat(o.total ?? '0'),
        customerName: o.customerName ?? '—',
        paymentNotes: o.paymentNotes ?? '',
        type: o.type,
      })),
    }
  })

  return NextResponse.json({ data })
}
