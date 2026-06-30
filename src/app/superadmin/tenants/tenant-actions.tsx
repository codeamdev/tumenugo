'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, PowerOff, Power, ExternalLink, Users } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/use-toast'

interface Props {
  tenantId: string
  tenantSlug: string
  status: string
}

export function TenantActionsMenu({ tenantId, tenantSlug, status }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function toggleStatus() {
    setLoading(true)
    const newStatus = status === 'active' ? 'suspended' : 'active'
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast({
        title: newStatus === 'active' ? 'Tenant activado' : 'Tenant suspendido',
        variant: newStatus === 'active' ? 'success' : 'default',
      })
      router.refresh()
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost'
  const isLocal = baseDomain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(baseDomain)
  const tenantUrl = isLocal
    ? `http://${tenantSlug}.${baseDomain}:3000`
    : `https://${tenantSlug}.${baseDomain}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={loading}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={tenantUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir panel
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/superadmin/tenants/${tenantId}/users`}>
            <Users className="h-4 w-4 mr-2" />
            Gestionar usuarios
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleStatus}>
          {status === 'active' ? (
            <>
              <PowerOff className="h-4 w-4 mr-2 text-destructive" />
              Suspender
            </>
          ) : (
            <>
              <Power className="h-4 w-4 mr-2 text-emerald-600" />
              Activar
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
