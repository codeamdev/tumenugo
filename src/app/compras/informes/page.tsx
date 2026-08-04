'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, ShoppingBag, BarChart3, Hash } from 'lucide-react'
import Link from 'next/link'

interface ReportData {
  period: { from: string; to: string }
  currencySign: string
  kpis: {
    total: number
    count: number
    average: number
    totalPrevious: number
    countPrevious: number
    growthPercent: number | null
  }
  byProduct: { name: string; total: number; count: number; average: number }[]
  dailySeries: { date: string; total: number; count: number }[]
}

const QUICK_RANGES = [
  { label: 'Hoy',      days: 0 },
  { label: '7 días',   days: 7 },
  { label: '30 días',  days: 30 },
  { label: 'Este mes', days: -1 },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function subtractDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">sin período anterior</span>
  const up   = pct > 0
  const zero = pct === 0
  const Icon = zero ? Minus : up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-red-500' : zero ? 'text-muted-foreground' : 'text-emerald-600'}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}{pct.toFixed(1)}% vs período anterior
    </span>
  )
}

export default function ComprasInformesPage() {
  const [from, setFrom] = useState(todayISO())
  const [to,   setTo]   = useState(todayISO())
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'resumen' | 'productos' | 'historial'>('resumen')
  const [history, setHistory] = useState<{ id: string; productName: string; quantity: string | null; value: string; description: string | null; purchasedAt: string }[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  const fmt = (n: number) => formatCurrency(n, data?.currencySign ?? '$')

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/tenant/purchases/informes?from=${from}&to=${to}`)
      const json = await res.json()
      setData(json.data)
    } finally { setLoading(false) }
  }

  async function loadHistory() {
    setLoadingHist(true)
    try {
      const res  = await fetch(`/api/tenant/purchases?from=${from}&to=${to}&limit=200`)
      const json = await res.json()
      setHistory(json.data ?? [])
    } finally { setLoadingHist(false) }
  }

  useEffect(() => { load() }, [from, to])

  useEffect(() => {
    if (activeTab === 'historial') loadHistory()
  }, [activeTab, from, to])

  function applyQuick(days: number) {
    const t = todayISO()
    if (days === -1) { setFrom(monthStart()); setTo(t) }
    else if (days === 0) { setFrom(t); setTo(t) }
    else { setFrom(subtractDays(t, days)); setTo(t) }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/compras" className="text-muted-foreground hover:text-foreground text-sm">← Compras</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold">Informes de compras</h1>
      </div>

      {/* Date controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => applyQuick(r.days)}
                  className="rounded-full border px-3 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border px-2 py-1 text-sm bg-background"
              />
              <span className="text-muted-foreground text-sm">—</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border px-2 py-1 text-sm bg-background"
              />
              <Button size="sm" onClick={load} disabled={loading}>Aplicar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16" /></CardContent></Card>
          ))
        ) : data && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span className="text-sm font-medium">Total gastado</span>
                </div>
                <p className="text-3xl font-bold">{fmt(data.kpis.total)}</p>
                <div className="mt-1"><GrowthBadge pct={data.kpis.growthPercent} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Hash className="h-4 w-4" />
                  <span className="text-sm font-medium">N° de compras</span>
                </div>
                <p className="text-3xl font-bold">{data.kpis.count}</p>
                <p className="text-xs text-muted-foreground mt-1">vs {data.kpis.countPrevious} en período anterior</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm font-medium">Promedio por compra</span>
                </div>
                <p className="text-3xl font-bold">{fmt(data.kpis.average)}</p>
                <p className="text-xs text-muted-foreground mt-1">en {data.kpis.count} registros</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['resumen', 'productos', 'historial'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'resumen' ? 'Tendencia diaria' : tab === 'productos' ? 'Por producto' : 'Historial'}
          </button>
        ))}
      </div>

      {/* Tab: Tendencia diaria */}
      {activeTab === 'resumen' && (
        <Card>
          <CardHeader><CardTitle>Gasto diario</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64" />
            ) : !data || data.dailySeries.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sin datos para el período seleccionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.dailySeries} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(v: number) => [fmt(v), 'Gasto']}
                    labelFormatter={(l) => formatDateShort(l as string)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Por producto */}
      {activeTab === 'productos' && (
        <Card>
          <CardHeader><CardTitle>Gasto por producto</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48" />
            ) : !data || data.byProduct.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sin datos.</p>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-5">Producto</span>
                  <span className="col-span-3 text-right">Total</span>
                  <span className="col-span-2 text-right">Compras</span>
                  <span className="col-span-2 text-right">Promedio</span>
                </div>
                {data.byProduct.map((p, i) => (
                  <div key={p.name} className="grid grid-cols-12 py-3 text-sm items-center">
                    <div className="col-span-5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                      <span className="font-medium truncate">{p.name}</span>
                    </div>
                    <span className="col-span-3 text-right font-semibold text-primary">{fmt(p.total)}</span>
                    <span className="col-span-2 text-right text-muted-foreground">{p.count}</span>
                    <span className="col-span-2 text-right text-muted-foreground">{fmt(p.average)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Historial */}
      {activeTab === 'historial' && (
        <Card>
          <CardHeader><CardTitle>Historial de compras</CardTitle></CardHeader>
          <CardContent>
            {loadingHist ? (
              <Skeleton className="h-48" />
            ) : history.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sin compras en el período.</p>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-4">Producto</span>
                  <span className="col-span-4">Descripción</span>
                  <span className="col-span-2">Fecha</span>
                  <span className="col-span-2 text-right">Valor</span>
                </div>
                {history.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 py-3 text-sm items-center">
                    <span className="col-span-4 font-medium truncate pr-2">
                      {p.productName}
                      {p.quantity && parseFloat(p.quantity) !== 1 && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">×{parseFloat(p.quantity)}</span>
                      )}
                    </span>
                    <span className="col-span-4 text-muted-foreground truncate pr-2">{p.description ?? '—'}</span>
                    <span className="col-span-2 text-muted-foreground text-xs">
                      {new Date(p.purchasedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="col-span-2 text-right font-semibold text-primary">{fmt(parseFloat(p.value))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
