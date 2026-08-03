import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { purchaseProducts, purchases } from '@/lib/db/schema/tenant'
import { desc, eq } from 'drizzle-orm'
import { ComprasClient } from './compras-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Compras' }

export default async function ComprasPage() {
  const tenant = await requireActiveTenant()

  const { catalog, recent } = await withTenant(tenant.schemaName, async (db) => ({
    catalog: await db.select().from(purchaseProducts).where(eq(purchaseProducts.isActive, true)).orderBy(purchaseProducts.name),
    recent:  await db.select().from(purchases).orderBy(desc(purchases.purchasedAt)).limit(30),
  }))

  return (
    <ComprasClient
      initialCatalog={catalog}
      initialRecent={recent}
      currencySign={tenant.currencySign ?? '$'}
    />
  )
}
