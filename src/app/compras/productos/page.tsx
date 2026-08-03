'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, AlertCircle, Package } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseProduct } from '@/lib/db/schema/tenant'

const UNITS = ['unidad', 'kg', 'g', 'L', 'mL', 'caja', 'bolsa', 'paquete', 'docena', 'botella', 'canasta']

export default function PurchaseProductsPage() {
  const [products, setProducts] = useState<PurchaseProduct[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseProduct | null>(null)
  const [form, setForm] = useState({ name: '', description: '', unit: 'unidad' })
  const [saving, setSaving] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/tenant/purchase-products')
      const data = await res.json()
      setProducts(data.data ?? [])
    } catch {
      setError('No se pudieron cargar los insumos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  function openNew() {
    setEditing(null)
    setForm({ name: '', description: '', unit: 'unidad' })
    setError('')
    setDialogOpen(true)
  }

  function openEdit(p: PurchaseProduct) {
    setEditing(p)
    setForm({ name: p.name, description: p.description ?? '', unit: p.unit })
    setError('')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setError(''); setSaving(true)
    try {
      const url    = editing ? `/api/tenant/purchase-products/${editing.id}` : '/api/tenant/purchase-products'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          unit: form.unit,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadProducts()
      setDialogOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setError('')
    try {
      await fetch(`/api/tenant/purchase-products/${id}`, { method: 'DELETE' })
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('No se pudo eliminar')
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/compras" className="text-muted-foreground hover:text-foreground text-sm">← Compras</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold">Catálogo de insumos</h1>
      </div>

      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="h-4 w-4" />Nuevo insumo</Button>
      </div>

      {error && !dialogOpen && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />Insumos / Productos de compra ({products.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4">Cargando...</p>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Package className="h-10 w-10" />
              <p className="text-sm">No hay insumos aún. Agrega los productos que compras habitualmente.</p>
              <Button onClick={openNew} variant="outline"><Plus className="h-4 w-4" />Agregar primero</Button>
            </div>
          ) : (
            <div className="divide-y">
              {products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">{p.unit}</Badge>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && dialogOpen && (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
            )}
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Café premium, Leche, Azúcar"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Unidad de medida</Label>
              <div className="flex flex-wrap gap-2">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, unit: u }))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      form.unit === u ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ej: Proveedor habitual, presentación 500g"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} loading={saving}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
