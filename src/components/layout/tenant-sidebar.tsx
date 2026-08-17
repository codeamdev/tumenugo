'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ShoppingCart, UtensilsCrossed, Archive,
  BarChart3, Settings, Wallet, Menu, Users, ChefHat,
} from 'lucide-react'
import { ROLE_LABELS } from '@/types'
import { LogoutButton } from './logout-button'
import { ThemeToggle } from './theme-toggle'
import { TenantTheme } from './tenant-theme'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface Props {
  tenantName: string
  primaryColor?: string | null
  role: string
}

export function TenantSidebar({ tenantName, primaryColor, role }: Props) {
  const [open, setOpen] = useState(false)

  const navItems = role === 'mesero'
    ? [{ href: '/pedidos', icon: ShoppingCart, label: 'Pedidos' }]
    : [
        { href: '/informes', icon: BarChart3, label: 'Informes' },
        { href: '/pedidos', icon: ShoppingCart, label: 'Pedidos' },
        { href: '/cocina', icon: ChefHat, label: 'Cocina' },
        { href: '/mesas', icon: UtensilsCrossed, label: 'Mesas' },
        { href: '/productos', icon: Archive, label: 'Productos' },
        { href: '/caja', icon: Wallet, label: 'Caja' },
        ...(role === 'admin'
          ? [
              { href: '/usuarios', icon: Users, label: 'Usuarios' },
              { href: '/configuracion', icon: Settings, label: 'Configuración' },
            ]
          : []),
      ]

  const sidebarInner = (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: primaryColor ?? '#2563eb' }}
        >
          {tenantName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{tenantName}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-0.5 shrink-0">
        <ThemeToggle />
        <LogoutButton />
      </div>
    </div>
  )

  return (
    <>
      <TenantTheme primaryColor={primaryColor} />

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 border-r flex-col">
        {sidebarInner}
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: primaryColor ?? '#2563eb' }}
        >
          {tenantName.charAt(0)}
        </div>
        <span className="font-semibold text-sm truncate">{tenantName}</span>
      </div>

      {/* ── Mobile sheet drawer ─────────────────────────────────────────── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-60 p-0 border-r">
          {sidebarInner}
        </SheetContent>
      </Sheet>
    </>
  )
}
