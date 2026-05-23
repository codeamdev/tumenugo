import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables } from '@/lib/db/schema/tenant'
import { eq } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TableFloorPlan } from './floor-plan'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mesas' }

const STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
  occupied: { label: 'Ocupada', color: 'bg-red-100 border-red-300 text-red-800' },
  reserved: { label: 'Reservada', color: 'bg-amber-100 border-amber-300 text-amber-800' },
  cleaning: { label: 'Limpieza', color: 'bg-blue-100 border-blue-300 text-blue-800' },
}

export default async function MesasPage() {
  const [session, tenant] = await Promise.all([requireTenantSession(), requireActiveTenant()])

  const allTables = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(tables).where(eq(tables.isActive, true))
  )

  const zones = Array.from(new Set(allTables.map((t) => t.zone)))
  const canEdit = session.role === 'admin'

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mesas</h1>
          <p className="text-muted-foreground">{allTables.length} mesas configuradas</p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href="/mesas/nueva">
              <Plus className="h-4 w-4" />
              Nueva mesa
            </Link>
          </Button>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => (
          <div key={key} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${color}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {label}
          </div>
        ))}
      </div>

      {/* Plano por zona */}
      {zones.map((zone) => (
        <div key={zone} className="space-y-3">
          <h2 className="text-lg font-semibold">{zone}</h2>
          <TableFloorPlan
            tables={allTables.filter((t) => t.zone === zone)}
            canEdit={canEdit}
          />
        </div>
      ))}

      {allTables.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 gap-3">
          <p className="text-muted-foreground">No hay mesas configuradas</p>
          {canEdit && (
            <Button asChild variant="outline">
              <Link href="/mesas/nueva">Agregar primera mesa</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
