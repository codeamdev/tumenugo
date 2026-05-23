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
import { AlertCircle } from 'lucide-react'
import type { Category, TaxRate } from '@/lib/db/schema/tenant' // just reuse types

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
    sortOrder?: number
  }
}

export function ProductForm({ categories, taxRates, initial }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial?.price ? String(parseFloat(initial.price)) : '',
    categoryId: initial?.categoryId ?? '',
    taxRateId: initial?.taxRateId ?? '__none__',
    prepTimeMin: initial?.prepTimeMin ?? 0,
    isAvailable: initial?.isAvailable ?? true,
    sortOrder: initial?.sortOrder ?? 0,
  })

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
            <Label>Estado</Label>
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
              {form.isAvailable ? 'Disponible para venta' : 'No disponible'}
            </button>
          </div>
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
