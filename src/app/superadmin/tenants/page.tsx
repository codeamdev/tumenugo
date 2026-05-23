import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Store } from 'lucide-react'
import { BUSINESS_TYPE_LABELS } from '@/types'
import { formatDate } from '@/lib/utils'
import { TenantActionsMenu } from './tenant-actions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tenants' }

const STATUS_BADGE: Record<string, 'success' | 'destructive' | 'warning'> = {
  active: 'success',
  suspended: 'destructive',
  pending: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  pending: 'Pendiente',
}

export default async function TenantsPage() {
  await requireSuperadminSession()

  const allTenants = await publicDb
    .select()
    .from(tenants)
    .orderBy(desc(tenants.createdAt))

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground">
            {allTenants.length} negocio{allTenants.length !== 1 ? 's' : ''} registrado
            {allTenants.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/superadmin/tenants/new">
            <Plus className="h-4 w-4" />
            Nuevo tenant
          </Link>
        </Button>
      </div>

      {/* Table */}
      {allTenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 gap-3">
          <Store className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No hay tenants aún</p>
          <Button asChild variant="outline">
            <Link href="/superadmin/tenants/new">Crear el primero</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead>Subdominio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: t.primaryColor ?? '#2563eb' }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.schemaName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {t.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    {BUSINESS_TYPE_LABELS[t.businessType as keyof typeof BUSINESS_TYPE_LABELS]}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[t.status] ?? 'outline'}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {t.createdAt ? formatDate(t.createdAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <TenantActionsMenu tenantId={t.id} tenantSlug={t.slug} status={t.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
