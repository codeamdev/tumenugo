import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { categories, taxRates } from '@/lib/db/schema/tenant'
import { eq } from 'drizzle-orm'
import { ProductForm } from '../product-form'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])
  if (!['admin', 'cajero'].includes(session.role)) redirect('/productos')

  const { cats, taxes } = await withTenant(tenant.schemaName, async (db) => ({
    cats: await db.select().from(categories).where(eq(categories.isActive, true)),
    taxes: await db.select().from(taxRates).where(eq(taxRates.isActive, true)),
  }))

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Nuevo producto</h1>
      <ProductForm categories={cats} taxRates={taxes} />
    </div>
  )
}
