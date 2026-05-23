'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { slugify } from '@/lib/utils'

export default function NewTenantPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    slug: '',
    businessType: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    primaryColor: '#2563eb',
  })

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: slugify(name),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.businessType) {
      setError('Selecciona un tipo de negocio')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        const msg = Array.isArray(data.error)
          ? data.error.map((e: { message: string }) => e.message).join(', ')
          : data.error
        setError(msg ?? 'Error al crear tenant')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/superadmin/tenants'), 2000)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold">Tenant creado exitosamente</h2>
          <p className="text-muted-foreground">Redirigiendo...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/superadmin/tenants">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuevo tenant</h1>
          <p className="text-muted-foreground">Provisiona un nuevo negocio en la plataforma</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Datos del negocio */}
        <Card>
          <CardHeader>
            <CardTitle>Datos del negocio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del negocio *</Label>
              <Input
                id="name"
                placeholder="Café Azul"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Subdominio *
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (solo minúsculas, números y guiones)
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="slug"
                  placeholder="cafe-azul"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  pattern="[a-z][a-z0-9\-]+"
                  required
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  .{process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessType">Tipo de negocio *</Label>
              <Select
                value={form.businessType}
                onValueChange={(v) => setForm((f) => ({ ...f, businessType: v }))}
                required
              >
                <SelectTrigger id="businessType">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cafeteria">Cafetería</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="fast_food">Comidas Rápidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Color principal</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="primaryColor"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded border border-input p-1"
                />
                <span className="text-sm text-muted-foreground">{form.primaryColor}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin del tenant */}
        <Card>
          <CardHeader>
            <CardTitle>Administrador inicial</CardTitle>
            <CardDescription>
              Se creará un usuario admin para que el negocio pueda entrar a su panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminName">Nombre completo *</Label>
              <Input
                id="adminName"
                placeholder="Carlos García"
                value={form.adminName}
                onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Correo electrónico *</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="admin@cafeazul.com"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">
                Contraseña *
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (mínimo 8 caracteres)
                </span>
              </Label>
              <Input
                id="adminPassword"
                type="password"
                placeholder="••••••••"
                value={form.adminPassword}
                onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                minLength={8}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Crear tenant y provisionar
        </Button>
      </form>
    </div>
  )
}
