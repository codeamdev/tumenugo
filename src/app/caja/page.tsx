import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { cashRegisters, orders, cashRegisterEntries } from '@/lib/db/schema/tenant'
import { eq, and, gte, desc, inArray } from 'drizzle-orm'

import { buildMethodLabels } from '@/lib/payment-methods'
import type { PosConfig } from '@/lib/db/schema/public'
import { CajaClient } from './caja-client'

export default async function CajaPage() {
  const session = await requireTenantSession()
  const tenant = await requireActiveTenant()

  const methodLabels = buildMethodLabels(tenant.posConfig as PosConfig | null)

  const { register, summary, history } = await withTenant(tenant.schemaName, async (db) => {
    const [register] = await db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.status, 'open'))
      .orderBy(desc(cashRegisters.openedAt))
      .limit(1)

    let summary = null
    if (register) {
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

        const orderIdsWithEntries = new Set<string>()
        for (const entry of entries) {
          orderIdsWithEntries.add(entry.orderId!)
          const isCustomKey = entry.paymentMethod === 'other' && entry.notes && methodLabels[entry.notes] !== undefined
          const key = isCustomKey ? entry.notes! : (entry.paymentMethod ?? 'other')
          byMethod[key] = (byMethod[key] ?? 0) + parseFloat(entry.amount ?? '0')
        }
        // Fallback for older orders without cashRegisterEntries
        for (const o of closedOrders) {
          if (!orderIdsWithEntries.has(o.id)) {
            const m = o.paymentMethod ?? 'other'
            byMethod[m] = (byMethod[m] ?? 0) + parseFloat(o.total ?? '0')
          }
        }
      }

      const cashSales = byMethod['cash'] ?? 0
      const expectedCash = parseFloat(register.openingAmount ?? '0') + cashSales

      summary = {
        totalOrders: closedOrders.length,
        totalSales: closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0),
        totalTips,
        byPaymentMethod: byMethod,
        expectedCash,
      }
    }

    const history = await db
      .select()
      .from(cashRegisters)
      .where(eq(cashRegisters.status, 'closed'))
      .orderBy(desc(cashRegisters.closedAt))
      .limit(10)

    return { register: register ?? null, summary, history }
  })

  function serializeReg(r: typeof register) {
    if (!r) return null
    return {
      ...r,
      openedAt: r.openedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
    }
  }

  return (
    <CajaClient
      register={serializeReg(register)}
      summary={summary}
      history={history.map((h) => serializeReg(h)!)}
      currencySign={tenant.currencySign ?? '$'}
      paymentMethodLabels={methodLabels}
      defaultOpeningAmount={tenant.posConfig?.defaultOpeningAmount ?? 0}
    />
  )
}
