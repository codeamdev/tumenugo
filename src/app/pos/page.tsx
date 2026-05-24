import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { products, categories, tables, taxRates, modifierGroups, modifiers } from '@/lib/db/schema/tenant'
import { eq, asc, and } from 'drizzle-orm'
import { POSScreen } from './pos-screen'
import { getPaymentMethods } from '@/lib/payment-methods'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedido' }

export default async function POSPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])

  const data = await withTenant(tenant.schemaName, async (db) => {
    const cats = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder))

    const prods = await db
      .select()
      .from(products)
      .where(eq(products.isAvailable, true))
      .orderBy(asc(products.sortOrder), asc(products.name))

    const mesas = await db
      .select()
      .from(tables)
      .where(eq(tables.isActive, true))
      .orderBy(asc(tables.name))

    const taxes = await db.select().from(taxRates).where(eq(taxRates.isActive, true))

    const groups = await db.select().from(modifierGroups).orderBy(asc(modifierGroups.sortOrder))
    const mods = await db.select().from(modifiers).orderBy(asc(modifiers.sortOrder))

    return {
      categories: cats,
      products: prods.map((p) => ({
        ...p,
        modifierGroups: groups
          .filter((g) => g.productId === p.id)
          .map((g) => ({
            ...g,
            modifiers: mods.filter((m) => m.groupId === g.id),
          })),
        taxRate: p.taxRateId ? parseFloat(taxes.find((t) => t.id === p.taxRateId)?.rate ?? '0') : 0,
        taxName: p.taxRateId ? taxes.find((t) => t.id === p.taxRateId)?.name : null,
      })),
      tables: mesas,
      taxRates: taxes,
    }
  })

  const deliveryFields = tenant.posConfig?.deliveryFields ?? {
    phone: true, address: true, notes: true, fee: true,
  }
  const paymentMethods = getPaymentMethods(tenant.posConfig)
  const defaultDeliveryFee = tenant.posConfig?.defaultDeliveryFee ?? 0

  return (
    <POSScreen
      {...data}
      userId={session.sub}
      tenantName={tenant.name}
      currencySign={tenant.currencySign ?? '$'}
      deliveryFields={deliveryFields}
      paymentMethods={paymentMethods}
      defaultDeliveryFee={defaultDeliveryFee}
    />
  )
}
