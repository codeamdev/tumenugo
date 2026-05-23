import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { products, categories, taxRates } from '@/lib/db/schema/tenant'
import { eq, asc } from 'drizzle-orm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, Archive } from 'lucide-react'
import { ProductosClient } from './productos-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Productos' }

export default async function ProductosPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])

  const { prods, cats, taxes } = await withTenant(tenant.schemaName, async (db) => ({
    prods: await db
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.name)),
    cats: await db.select().from(categories).where(eq(categories.isActive, true)),
    taxes: await db.select().from(taxRates),
  }))

  const canEdit = ['admin', 'cajero'].includes(session.role)

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground">{prods.length} productos en el catálogo</p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href="/productos/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {prods.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 gap-3">
          <Archive className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No hay productos aún</p>
          {canEdit && (
            <Button asChild variant="outline">
              <Link href="/productos/nuevo">Agregar el primero</Link>
            </Button>
          )}
        </div>
      ) : (
        <ProductosClient
          products={prods}
          categories={cats}
          taxRates={taxes}
          canEdit={canEdit}
          currencySign={tenant.currencySign ?? '$'}
        />
      )}
    </div>
  )
}
