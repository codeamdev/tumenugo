'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Plus, AlertCircle, CheckCircle2, Users } from 'lucide-react'
import Link from 'next/link'

interface TenantUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', cajero: 'Cajero', mesero: 'Mesero', cocina: 'Cocina',
}

export default function TenantUsersPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [users, setUsers]         = useState<TenantUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [tenantName, setTenantName] = useState('')

  const [form, setForm] = useState({ name: '', email: '', role: 'mesero', password: '' })

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}/users`)
      const data = await res.json()
      setUsers(data.data ?? [])
    } catch {
      setError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTenant() {
    const res = await fetch(`/api/superadmin/tenants/${id}`)
    const data = await res.json()
    setTenantName(data.data?.name ?? '')
  }

  useEffect(() => {
    fetchTenant()
    fetchUsers()
  }, [id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    setSaving(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = Array.isArray(data.error)
          ? data.error.map((e: { message: string }) => e.message).join(', ')
          : data.error
        setError(msg ?? 'Error al crear usuario')
        return
      }
      setSuccess(`Usuario ${data.data?.name} creado correctamente.`)
      setForm({ name: '', email: '', role: 'mesero', password: '' })
      fetchUsers()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/superadmin/tenants"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Usuarios — {tenantName}</h1>
          <p className="text-muted-foreground text-sm">Gestiona los empleados de este negocio</p>
        </div>
      </div>

      {/* Crear usuario */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Nuevo usuario</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            {error  && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertDescription className="text-emerald-700">{success}</AlertDescription></Alert>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ana López" required />
              </div>
              <div className="space-y-2">
                <Label>Correo electrónico *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@negocio.com" required />
              </div>
              <div className="space-y-2">
                <Label>Rol *</Label>
                <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="cajero">Cajero</SelectItem>
                    <SelectItem value="mesero">Mesero</SelectItem>
                    <SelectItem value="cocina">Cocina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contraseña * <span className="text-xs text-muted-foreground">(mín. 8 caracteres)</span></Label>
                <Input type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} required />
              </div>
            </div>
            <Button type="submit" loading={saving}>Crear usuario</Button>
          </form>
        </CardContent>
      </Card>

      {/* Lista de usuarios */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Usuarios actuales ({users.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Cargando...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin usuarios registrados.</p>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.isActive ? 'default' : 'secondary'}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    {!u.isActive && <Badge variant="outline" className="text-muted-foreground">Inactivo</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
