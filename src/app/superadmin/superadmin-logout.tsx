'use client'

import { LogOut } from 'lucide-react'

export function SuperadminLogout() {
  async function handleLogout() {
    await fetch('/api/superadmin/auth/logout', { method: 'POST' })
    window.location.href = '/superadmin/login'
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground"
    >
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </button>
  )
}
