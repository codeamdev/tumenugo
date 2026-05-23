import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { TenantTheme } from '@/components/layout/tenant-theme'
import { TenantSidebar } from '@/components/layout/tenant-sidebar'
import { redirect } from 'next/navigation'

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const [session, tenant] = await Promise.all([
    requireTenantSession(),
    requireActiveTenant(),
  ])

  if (!['mesero', 'cajero', 'admin'].includes(session.role)) {
    redirect('/dashboard')
  }

  // Mesero: minimal shell without sidebar (full-screen tablet UI)
  if (session.role === 'mesero') {
    return (
      <div className="h-screen overflow-hidden bg-background flex flex-col">
        <TenantTheme primaryColor={tenant.primaryColor} />
        {children}
      </div>
    )
  }

  // Cajero / Admin: standard layout with sidebar
  return (
    <div className="flex h-screen overflow-hidden">
      <TenantSidebar
        tenantName={tenant.name}
        primaryColor={tenant.primaryColor}
        role={session.role}
      />
      <main className="flex-1 overflow-hidden flex flex-col pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
