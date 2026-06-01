'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Tenant {
  id: string
  name: string
  slug: string
}

interface Props {
  defaultTenantSlug: string
  tenants: Tenant[]
}

const NONE_VALUE = '__none__'

export function ConfigForm({ defaultTenantSlug, tenants }: Props) {
  const [selected, setSelected] = useState(defaultTenantSlug || NONE_VALUE)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  async function handleSave() {
    setSaving(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/superadmin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultTenantSlug: selected === NONE_VALUE ? '' : selected }),
      })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant por defecto</CardTitle>
        <CardDescription>
          Registra qué tenant es el predeterminado. Después de guardar, actualiza
          <code className="mx-1 px-1 rounded bg-muted text-xs">DEFAULT_TENANT_SLUG</code>
          en el archivo <code className="px-1 rounded bg-muted text-xs">.env.production</code> del
          servidor y reinicia el contenedor para que tome efecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tenant activo</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Selecciona un tenant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>
                <span className="text-muted-foreground">Sin tenant por defecto</span>
              </SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.slug}>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t.slug}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
          {status === 'ok' && (
            <p className="text-sm text-green-600">Configuración guardada</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-destructive">Error al guardar</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
