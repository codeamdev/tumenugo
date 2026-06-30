import { requireTenantSession } from '@/lib/auth/session'
import { getCurrentTenant } from '@/lib/tenant'
import { TenantSidebar } from '@/components/layout/tenant-sidebar'
import { redirect } from 'next/navigation'
import { SuspendedOverlay } from '@/components/layout/suspended-overlay'

export default async function TenantDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, tenant] = await Promise.all([
    requireTenantSession(),
    getCurrentTenant(),
  ])

  if (!tenant) redirect('/login')

  // Tenant suspendido: muestra overlay informativo sin borrar nada
  if (tenant.status === 'suspended') {
    return <SuspendedOverlay tenantName={tenant.name} />
  }

  if (tenant.status !== 'active') redirect('/login')

  return (
    <div className="flex min-h-screen">
      <TenantSidebar
        tenantName={tenant.name}
        primaryColor={tenant.primaryColor}
        role={session.role}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}

