import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { TenantSidebar } from '@/components/layout/tenant-sidebar'
import { redirect } from 'next/navigation'

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const [session, tenant] = await Promise.all([
    requireTenantSession(),
    requireActiveTenant(),
  ])

  if (session.role !== 'admin') redirect('/dashboard')

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

