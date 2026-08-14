'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, X, Plus } from 'lucide-react'

interface Props {
  categories: { id: string; name: string; emoji?: string | null }[]
  taxRates: { id: string; name: string; type: string; rate: string }[]
  initial?: {
    id?: string
    name?: string
    description?: string | null
    price?: string
    categoryId?: string
    taxRateId?: string | null
    prepTimeMin?: number | null
    isAvailable?: boolean
    inStock?: boolean
    sortOrder?: number
    flavors?: string[] | null
  }
}

export function ProductForm({ categories, taxRates, initial }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newFlavor, setNewFlavor] = useState('')

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial?.price ? String(parseFloat(initial.price)) : '',
    categoryId: initial?.categoryId ?? '',
    taxRateId: initial?.taxRateId ?? '__none__',
    prepTimeMin: initial?.prepTimeMin ?? 0,
    isAvailable: initial?.isAvailable ?? true,
    inStock: initial?.inStock ?? true,
    sortOrder: initial?.sortOrder ?? 0,
    flavors: (initial?.flavors ?? []) as string[],
  })

  function addFlavor() {
    const trimmed = newFlavor.trim()
    if (!trimmed || form.flavors.includes(trimmed)) return
    setForm((f) => ({ ...f, flavors: [...f.flavors, trimmed] }))
    setNewFlavor('')
  }

  function removeFlavor(fl: string) {
    setForm((f) => ({ ...f, flavors: f.flavors.filter((x) => x !== fl) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const payload = {
      ...form,
      price: String(parseFloat(form.price)),
      taxRateId: form.taxRateId === '__none__' ? null : form.taxRateId || null,
      prepTimeMin: Number(form.prepTimeMin),
      sortOrder: Number(form.sortOrder),
      flavors: form.flavors,
    }

    try {
      const url = isEdit ? `/api/tenant/products/${initial!.id}` : '/api/tenant/products'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        const msg = Array.isArray(data.error)
          ? data.error.map((e: { message: string }) => e.message).join(', ')
          : data.error
        setError(msg)
        return
      }

      router.push('/productos')
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Información básica</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Precio * ($)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="100"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepTime">Tiempo prep. (min)</Label>
              <Input
                id="prepTime"
                type="number"
                min="0"
                value={form.prepTimeMin}
                onChange={(e) => setForm((f) => ({ ...f, prepTimeMin: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoría *</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Impuesto</Label>
              <Select
                value={form.taxRateId ?? '__none__'}
                onValueChange={(v) => setForm((f) => ({ ...f, taxRateId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin impuesto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin impuesto</SelectItem>
                  {taxRates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.rate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Visibilidad en POS</Label>
            <p className="text-xs text-muted-foreground">Desactivar oculta el producto del catálogo</p>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isAvailable: !f.isAvailable }))}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border-2 transition-all ${
                form.isAvailable
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700'
                  : 'border-slate-300 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${form.isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {form.isAvailable ? 'Visible en POS' : 'Oculto del POS'}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Stock</Label>
            <p className="text-xs text-muted-foreground">Desactivar muestra "Agotado" sin ocultar el producto</p>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, inStock: !f.inStock }))}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border-2 transition-all ${
                form.inStock
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700'
                  : 'border-red-300 bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400 dark:border-red-700'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${form.inStock ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {form.inStock ? 'En stock' : 'Agotado'}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sabores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Agrega los sabores disponibles para este producto. Al seleccionarlo en el POS, el cajero deberá elegir un sabor.
          </p>
          <div className="flex gap-2">
            <Input
              value={newFlavor}
              onChange={(e) => setNewFlavor(e.target.value)}
              placeholder="Ej: Fresa, Chocolate, Vainilla..."
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFlavor() } }}
            />
            <Button type="button" variant="outline" onClick={addFlavor} disabled={!newFlavor.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {form.flavors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.flavors.map((fl) => (
                <span
                  key={fl}
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium bg-secondary"
                >
                  {fl}
                  <button
                    type="button"
                    onClick={() => removeFlavor(fl)}
                    className="ml-1 rounded-full hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" loading={loading}>
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
