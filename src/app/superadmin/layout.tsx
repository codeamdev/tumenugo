import { getAccessToken } from '@/lib/auth/cookies'
import { verifyAccessToken } from '@/lib/auth/jwt'
import Link from 'next/link'
import { Coffee, Store } from 'lucide-react'
import { SuperadminLogout } from './superadmin-logout'

async function getSuperadminSession() {
  const token = getAccessToken('superadmin')
  if (!token) return null
  try {
    const payload = await verifyAccessToken(token)
    if (payload.type !== 'superadmin') return null
    return payload
  } catch {
    return null
  }
}

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSuperadminSession()
  if (!session) return <>{children}</>
  return <SuperadminShell>{children}</SuperadminShell>
}

function SuperadminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coffee className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">CafeteriaOS</p>
            <p className="text-xs text-muted-foreground">Superadmin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/superadmin/tenants"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Store className="h-4 w-4" />
            Tenants
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <SuperadminLogout />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
