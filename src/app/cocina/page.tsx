import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables, users } from '@/lib/db/schema/tenant'
import { eq, asc } from 'drizzle-orm'
import { CocinaScreen } from './cocina-screen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cocina' }

export default async function CocinaPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [mesas, [currentUser]] = await Promise.all([
      db.select({ id: tables.id, name: tables.name }).from(tables).where(eq(tables.isActive, true)).orderBy(asc(tables.name)),
      db.select({ name: users.name }).from(users).where(eq(users.id, session.sub)).limit(1),
    ])
    return { tables: mesas, userName: currentUser?.name ?? 'Cocina' }
  })

  return (
    <CocinaScreen
      tenantName={tenant.name}
      primaryColor={tenant.primaryColor ?? '#2563eb'}
      tables={data.tables}
      userName={data.userName}
    />
  )
}
