'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoreHorizontal, ShoppingCart, Brush, Check } from 'lucide-react'

interface TableItem {
  id: string
  name: string
  capacity: number
  zone: string
  status: string
  posX: number | null
  posY: number | null
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  available: { label: 'Disponible', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
  occupied: { label: 'Ocupada', bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' },
  reserved: { label: 'Reservada', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
  cleaning: { label: 'Limpieza', bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
}

interface Props {
  tables: TableItem[]
  canEdit: boolean
}

export function TableFloorPlan({ tables, canEdit }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  async function changeStatus(tableId: string, status: string) {
    try {
      const res = await fetch(`/api/tenant/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      toast({ title: 'Error al actualizar mesa', variant: 'destructive' })
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
    <div className="flex flex-wrap gap-3 min-w-0">
      {tables.map((table) => {
        const config = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available
        return (
          <div
            key={table.id}
            className={`relative flex flex-col items-center justify-center w-32 h-28 rounded-xl border-2 ${config.bg} ${config.border} transition-all`}
          >
            <span className={`text-lg font-bold ${config.text}`}>{table.name}</span>
            <span className="text-xs text-muted-foreground">{table.capacity} personas</span>
            <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>

            {/* Actions */}
            <div className="absolute top-1.5 right-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => router.push(`/pos?mesa=${table.id}`)}>
                    <ShoppingCart className="h-3.5 w-3.5 mr-2" />
                    Nuevo pedido
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => changeStatus(table.id, 'available')}>
                    <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                    Disponible
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeStatus(table.id, 'cleaning')}>
                    <Brush className="h-3.5 w-3.5 mr-2 text-blue-600" />
                    En limpieza
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => changeStatus(table.id, 'reserved')}>
                    Reservada
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}
