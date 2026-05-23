import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { products, categories, taxRates } from '@/lib/db/schema/tenant'
import { eq } from 'drizzle-orm'
import { ProductForm } from '../../product-form'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar producto' }

export default async function EditarProductoPage({ params }: { params: { id: string } }) {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])
  if (!['admin', 'cajero'].includes(session.role)) redirect('/productos')

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [[product], cats, taxes] = await Promise.all([
      db.select().from(products).where(eq(products.id, params.id)).limit(1),
      db.select().from(categories).where(eq(categories.isActive, true)),
      db.select().from(taxRates).where(eq(taxRates.isActive, true)),
    ])
    return { product: product ?? null, cats, taxes }
  })

  if (!data.product) notFound()

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight mb-1">Editar producto</h1>
      <p className="text-muted-foreground mb-6">{data.product.name}</p>
      <ProductForm
        categories={data.cats}
        taxRates={data.taxes}
        initial={{
          id: data.product.id,
          name: data.product.name,
          description: data.product.description,
          price: data.product.price,
          categoryId: data.product.categoryId,
          taxRateId: data.product.taxRateId,
          prepTimeMin: data.product.prepTimeMin,
          isAvailable: data.product.isAvailable,
          sortOrder: data.product.sortOrder ?? 0,
        }}
      />
    </div>
  )
}
