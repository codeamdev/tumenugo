'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Users, KeyRound } from 'lucide-react'

type UserRole = 'admin' | 'cajero' | 'mesero' | 'cocina'

interface UserRow {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  cajero: 'bg-blue-100 text-blue-700 border-blue-200',
  mesero: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cocina: 'bg-amber-100 text-amber-700 border-amber-200',
}

const emptyForm = { name: '', email: '', password: '', role: 'mesero' as UserRole }

export function UsuariosClient({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/tenant/users')
    const json = await res.json()
    setUsers(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function openCreate() {
    setEditingUser(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(user: UserRow) {
    setEditingUser(user)
    setForm({ name: user.name, email: user.email, password: '', role: user.role })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.email || (!editingUser && !form.password)) {
      toast({ title: 'Completa todos los campos requeridos', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const url = editingUser ? `/api/tenant/users/${editingUser.id}` : '/api/tenant/users'
      const method = editingUser ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { name: form.name, email: form.email, role: form.role }
      if (form.password) body.password = form.password

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: json.error ?? 'Error al guardar', variant: 'destructive' })
        return
      }
      toast({ title: editingUser ? 'Usuario actualizado' : 'Usuario creado', variant: 'success' })
      setDialogOpen(false)
      fetchUsers()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user: UserRow) {
    await fetch(`/api/tenant/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    fetchUsers()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tenant/users/${id}`, { method: 'DELETE' })
    toast({ title: 'Usuario eliminado', variant: 'success' })
    setDeleteId(null)
    fetchUsers()
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Cargando…</div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 gap-3">
          <Users className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No hay usuarios aún</p>
          <Button variant="outline" onClick={openCreate}>Agregar el primero</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={!u.isActive ? 'opacity-50' : ''}>
                  <TableCell>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground sm:hidden">{u.email}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.isActive}
                      onCheckedChange={() => toggleActive(u)}
                      disabled={u.id === currentUserId}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="María García"
              />
            </div>
            <div className="space-y-2">
              <Label>Correo electrónico *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="maria@cafeteria.com"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                {editingUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
              />
            </div>
            <div className="space-y-2">
              <Label>Rol *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="mesero">Mesero</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.role === 'admin' && 'Acceso total al sistema y configuración'}
                {form.role === 'cajero' && 'POS completo, caja y cierre de pedidos'}
                {form.role === 'mesero' && 'Tomar pedidos y ver el menú'}
                {form.role === 'cocina' && 'Ver y actualizar estado de pedidos en cocina'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} loading={saving} className="flex-1">
                {editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar usuario?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Eliminar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
