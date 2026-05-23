import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { TenantTheme } from '@/components/layout/tenant-theme'
import { redirect } from 'next/navigation'

export default async function CocinaLayout({ children }: { children: React.ReactNode }) {
  const [session, tenant] = await Promise.all([
    requireTenantSession(),
    requireActiveTenant(),
  ])

  if (!['cocina', 'admin'].includes(session.role)) redirect('/dashboard')

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TenantTheme primaryColor={tenant.primaryColor} />
      {children}
    </div>
  )
}
