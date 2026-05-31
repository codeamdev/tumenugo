import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { getDefaultTenantSlug } from '@/lib/system-config'
import { eq } from 'drizzle-orm'
import { ConfigForm } from './config-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configuración global' }

export default async function ConfiguracionPage() {
  await requireSuperadminSession()

  const [defaultSlug, activeTenants] = await Promise.all([
    getDefaultTenantSlug(),
    publicDb
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.status, 'active'))
      .orderBy(tenants.name),
  ])

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración global</h1>
        <p className="text-muted-foreground">Parámetros que afectan a todo el sistema.</p>
      </div>
      <ConfigForm defaultTenantSlug={defaultSlug} tenants={activeTenants} />
    </div>
  )
}
