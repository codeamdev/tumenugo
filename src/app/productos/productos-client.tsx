'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Search, Pencil, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ProductToggleAvailable } from './product-controls'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  description?: string | null
  price: string
  categoryId: string
  taxRateId?: string | null
  isAvailable: boolean
  sortOrder?: number | null
}

interface Category {
  id: string
  name: string
  emoji?: string | null
}

interface TaxRate {
  id: string
  name: string
}

interface Props {
  products: Product[]
  categories: Category[]
  taxRates: TaxRate[]
  canEdit: boolean
  currencySign: string
}

type AvailFilter = 'all' | 'available' | 'unavailable'

export function ProductosClient({ products, categories, taxRates, canEdit, currencySign }: Props) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const taxMap = useMemo(() => Object.fromEntries(taxRates.map((t) => [t.id, t])), [taxRates])

  const filtered = useMemo(() => {
    let list = products
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }
    if (catFilter !== 'all') list = list.filter((p) => p.categoryId === catFilter)
    if (availFilter === 'available') list = list.filter((p) => p.isAvailable)
    if (availFilter === 'unavailable') list = list.filter((p) => !p.isAvailable)
    return list
  }, [products, search, catFilter, availFilter])

  const hasFilters = search.trim() || catFilter !== 'all' || availFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setCatFilter('all')
    setAvailFilter('all')
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm h-10"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-md border overflow-hidden text-sm">
          {(['all', 'available', 'unavailable'] as AvailFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setAvailFilter(v)}
              className={`px-3 py-2 transition-colors ${
                availFilter === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {v === 'all' ? 'Todos' : v === 'available' ? 'Disponibles' : 'Agotados'}
            </button>
          ))}
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} de {products.length}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Search className="h-10 w-10 opacity-30" />
          <p>Sin resultados para los filtros actuales</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead className="hidden md:table-cell">Impuesto</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className={!p.isAvailable ? 'opacity-50' : ''}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 hidden sm:block">{p.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {catMap[p.categoryId] ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        {catMap[p.categoryId].emoji} {catMap[p.categoryId].name}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="font-mono font-medium">
                    {formatCurrency(p.price, currencySign)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.taxRateId && taxMap[p.taxRateId] ? (
                      <Badge variant="outline" className="text-xs">{taxMap[p.taxRateId].name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin impuesto</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <ProductToggleAvailable productId={p.id} isAvailable={p.isAvailable} />
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        p.isAvailable
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${p.isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {p.isAvailable ? 'Disponible' : 'Agotado'}
                      </span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/productos/${p.id}/editar`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
