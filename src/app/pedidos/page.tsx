import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import {
  products, categories, tables, taxRates, modifierGroups, modifiers, users,
} from '@/lib/db/schema/tenant'
import { eq, asc } from 'drizzle-orm'
import { PedidosScreen } from './pedidos-screen'
import { getPaymentMethods } from '@/lib/payment-methods'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedidos' }

export default async function PedidosPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [cats, prods, mesas, taxes, groups, mods, [currentUser]] = await Promise.all([
      db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder)),
      db.select().from(products).where(eq(products.isAvailable, true)).orderBy(asc(products.sortOrder), asc(products.name)),
      db.select().from(tables).where(eq(tables.isActive, true)).orderBy(asc(tables.name)),
      db.select().from(taxRates).where(eq(taxRates.isActive, true)),
      db.select().from(modifierGroups).orderBy(asc(modifierGroups.sortOrder)),
      db.select().from(modifiers).orderBy(asc(modifiers.sortOrder)),
      db.select({ name: users.name }).from(users).where(eq(users.id, session.sub)).limit(1),
    ])

    return {
      categories: cats,
      products: prods.map((p) => ({
        ...p,
        modifierGroups: groups
          .filter((g) => g.productId === p.id)
          .map((g) => ({ ...g, modifiers: mods.filter((m) => m.groupId === g.id) })),
        taxRate: p.taxRateId ? parseFloat(taxes.find((t) => t.id === p.taxRateId)?.rate ?? '0') : 0,
        taxName: p.taxRateId ? (taxes.find((t) => t.id === p.taxRateId)?.name ?? null) : null,
      })),
      tables: mesas,
      userName: currentUser?.name ?? 'Mesero',
    }
  })

  const deliveryFields = tenant.posConfig?.deliveryFields ?? {
    phone: true, address: true, notes: true, fee: true,
  }
  const paymentMethods = getPaymentMethods(tenant.posConfig)

  return (
    <PedidosScreen
      categories={data.categories}
      products={data.products}
      tables={data.tables}
      userId={session.sub}
      userName={data.userName}
      tenantName={tenant.name}
      currencySign={tenant.currencySign ?? '$'}
      deliveryFields={deliveryFields}
      primaryColor={tenant.primaryColor ?? '#2563eb'}
      role={session.role}
      paymentMethods={paymentMethods}
    />
  )
}
