'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  ShoppingBag, Trash2, AlertCircle, CheckCircle2,
  BookOpen, BarChart3, Package,
} from 'lucide-react'
import Link from 'next/link'
import type { PurchaseProduct, Purchase } from '@/lib/db/schema/tenant'

interface Props {
  initialCatalog: PurchaseProduct[]
  initialRecent:  Purchase[]
  currencySign:   string
}

export function ComprasClient({ initialCatalog, initialRecent, currencySign }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [catalog, setCatalog]   = useState(initialCatalog)
  const [recent,  setRecent]    = useState(initialRecent)
  const [error,   setError]     = useState('')
  const [success, setSuccess]   = useState('')
  const [saving,  setSaving]    = useState(false)

  // Form
  const [mode,        setMode]        = useState<'catalog' | 'libre'>('catalog')
  const [selectedId,  setSelectedId]  = useState('')
  const [freeName,    setFreeName]    = useState('')
  const [value,       setValue]       = useState('')
  const [description, setDescription] = useState('')

  const fmt = (n: number | string) => formatCurrency(typeof n === 'string' ? parseFloat(n) : n, currencySign)

  const productName = mode === 'catalog'
    ? (catalog.find((p) => p.id === selectedId)?.name ?? '')
    : freeName

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!productName.trim())         { setError('Selecciona o escribe un producto'); return }
    const valNum = parseFloat(value)
    if (isNaN(valNum) || valNum <= 0){ setError('Ingresa un valor válido'); return }

    setSaving(true)
    try {
      const res  = await fetch('/api/tenant/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseProductId: mode === 'catalog' && selectedId ? selectedId : undefined,
          productName: productName.trim(),
          value: valNum.toFixed(2),
          description: description.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al registrar')

      setSuccess(`Compra de "${productName}" registrada.`)
      setValue(''); setDescription(''); setSelectedId(''); setFreeName('')

      // Refresh list
      const listRes = await fetch('/api/tenant/purchases?limit=30')
      const listData = await listRes.json()
      setRecent(listData.data ?? [])
    } catch (err: any) {
      setError(err.message ?? 'Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/tenant/purchases/${id}`, { method: 'DELETE' })
      setRecent((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('No se pudo eliminar la compra')
    }
  }

  const totalHoy = recent
    .filter((p) => p.purchasedAt && new Date(p.purchasedAt).toDateString() === new Date().toDateString())
    .reduce((sum, p) => sum + parseFloat(p.value), 0)

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
          <p className="text-muted-foreground">Registra los gastos de abastecimiento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/compras/productos"><Package className="h-4 w-4" />Catálogo</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/compras/informes"><BarChart3 className="h-4 w-4" />Informes</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── LEFT: Form ── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Registrar compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error   && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                {success && <Alert className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertDescription className="text-emerald-700 dark:text-emerald-400">{success}</AlertDescription></Alert>}

                {/* Tipo de producto */}
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMode('catalog'); setFreeName('') }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'catalog' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    Del catálogo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('libre'); setSelectedId('') }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'libre' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    Producto libre
                  </button>
                </div>

                {/* Producto */}
                <div className="space-y-2">
                  <Label>Producto *</Label>
                  {mode === 'catalog' ? (
                    catalog.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No hay productos en el catálogo.{' '}
                        <Link href="/compras/productos" className="underline">Agregar</Link>
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                        {catalog.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedId(p.id === selectedId ? '' : p.id)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                              selectedId === p.id
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'hover:border-primary'
                            }`}
                          >
                            {p.name}
                            {p.unit !== 'unidad' && (
                              <span className="ml-1 opacity-60 text-xs">({p.unit})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <Input
                      value={freeName}
                      onChange={(e) => setFreeName(e.target.value)}
                      placeholder="Ej: Azúcar, Leche entera..."
                    />
                  )}
                </div>

                {/* Valor */}
                <div className="space-y-2">
                  <Label htmlFor="value">Valor *</Label>
                  <Input
                    id="value"
                    type="number"
                    min="0"
                    step="100"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Ej: 25000"
                  />
                </div>

                {/* Descripción */}
                <div className="space-y-2">
                  <Label htmlFor="desc">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej: Proveedor La Montaña, 2 kg"
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  Fecha y hora: <span className="font-medium">{new Date().toLocaleString('es-CO')}</span> (automática)
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={saving || !productName.trim() || !value}
                  loading={saving}
                >
                  Registrar compra
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Recent purchases ── */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Compras recientes
                </CardTitle>
                <Badge variant="secondary">
                  Hoy: {fmt(totalHoy)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No hay compras registradas.</p>
              ) : (
                <div className="divide-y">
                  {recent.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.productName}</p>
                        {p.description && (
                          <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.purchasedAt ? formatDateTime(p.purchasedAt.toString()) : ''}
                        </p>
                      </div>
                      <span className="font-semibold text-sm shrink-0 text-primary">
                        {fmt(p.value)}
                      </span>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
