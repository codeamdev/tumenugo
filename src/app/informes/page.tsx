'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import { Download, TrendingUp, ShoppingBag, AlertTriangle, Clock } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'

const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#dc2626']

interface PendingPayment {
  id: string
  closedAt: string | null
  total: number
  customerName: string
  paymentNotes: string
  type: string
}

interface ReportData {
  period: { from: string; to: string }
  currencySign: string
  kpis: { totalSales: number; totalOrders: number; totalPending: number; pendingCount: number }
  byMethod: Record<string, number>
  paymentMethodLabels: Record<string, string>
  byType: Record<string, number>
  dailySeries: { date: string; sales: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  byCategory: { name: string; emoji: string | null; revenue: number; qty: number }[]
  lowRotation: { name: string; qty: number }[]
  pendingPayments: PendingPayment[]
}

function todayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

const QUICK_RANGES = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
]

export default function InformesPage() {
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const fmt = (n: number) => formatCurrency(n, data?.currencySign ?? '$')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/tenant/informes?from=${from}&to=${to}`)
      const json = await res.json()
      setData(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to])

  function setRange(days: number) {
    const t = todayISO()
    if (days === 0) { setFrom(t); setTo(t); return }
    const f = new Date()
    f.setDate(f.getDate() - days)
    setFrom(f.toISOString().slice(0, 10))
    setTo(t)
  }

  const methodPie = data
    ? Object.entries(data.byMethod).map(([name, value]) => ({
        name: data.paymentMethodLabels[name] ?? name,
        value,
      }))
    : []

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Informes</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              className="rounded-full px-3 py-1 text-sm border hover:bg-muted transition-colors"
            >
              {r.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-muted-foreground">Desde</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-muted-foreground">Hasta</label>
            <input
              type="date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/tenant/informes/export?from=${from}&to=${to}`, '_blank')} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /></Card>
            ))
          : [
              { icon: TrendingUp, label: 'Ventas cobradas', value: fmt(data?.kpis.totalSales ?? 0), color: 'text-primary', extra: null },
              { icon: ShoppingBag, label: 'Pedidos cobrados', value: String(data?.kpis.totalOrders ?? 0), color: 'text-foreground', extra: null },
              {
                icon: Clock,
                label: 'Cuentas por cobrar',
                value: fmt(data?.kpis.totalPending ?? 0),
                color: (data?.kpis.totalPending ?? 0) > 0 ? 'text-amber-600' : 'text-muted-foreground',
                extra: (data?.kpis.pendingCount ?? 0) > 0
                  ? <span className="text-xs text-amber-600">{data!.kpis.pendingCount} pendiente{data!.kpis.pendingCount !== 1 ? 's' : ''}</span>
                  : null,
              },
            ].map(({ icon: Icon, label, value, color, extra }) => (
              <Card key={label} className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs uppercase font-medium">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                {extra}
              </Card>
            ))}
      </div>

      {/* Ventas por día */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Ventas por día</h2>
        {loading
          ? <Skeleton className="h-52 w-full" />
          : (data?.dailySeries?.length ?? 0) === 0
          ? <p className="text-sm text-muted-foreground py-12 text-center">Sin ventas en el período</p>
          : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={data?.dailySeries ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={formatDate} />
                <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={false} name="Ventas" />
              </LineChart>
            </ResponsiveContainer>
          )}
      </Card>

      {/* Ventas por categoría + Métodos de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Categorías */}
        <Card className="lg:col-span-2 p-4 space-y-3">
          <h2 className="font-semibold text-sm">Ventas por categoría</h2>
          {loading
            ? <Skeleton className="h-48 w-full" />
            : (data?.byCategory?.length ?? 0) === 0
            ? <p className="text-sm text-muted-foreground py-12 text-center">Sin ventas en el período</p>
            : (
              <div className="space-y-2">
                {data!.byCategory.map((c, i) => {
                  const maxRev = data!.byCategory[0].revenue
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center">{c.emoji ?? '📦'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{c.qty} uds · {fmt(c.revenue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </Card>

        {/* Métodos de pago */}
        <Card className="p-4 space-y-2">
          <h2 className="font-semibold text-sm">Métodos de pago</h2>
          {loading
            ? <Skeleton className="h-48 w-full" />
            : methodPie.length === 0
            ? <p className="text-sm text-muted-foreground py-12 text-center">Sin datos</p>
            : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={methodPie} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value">
                      {methodPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {methodPie.map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground">{m.name}</span>
                      </div>
                      <span className="font-medium">{fmt(m.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
        </Card>
      </div>

      {/* Top 10 + Baja rotación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 10 */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">Top 10 más vendidos</h2>
          {loading
            ? <Skeleton className="h-48 w-full" />
            : (data?.topProducts?.length ?? 0) === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">Sin ventas en el período</p>
            : (
              <div className="space-y-2">
                {data!.topProducts.map((p, i) => {
                  const maxQty = data!.topProducts[0].qty
                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate font-medium">{p.name}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{p.qty} uds · {fmt(p.revenue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </Card>

        {/* Baja rotación */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">Productos de baja rotación</h2>
          </div>
          <p className="text-xs text-muted-foreground">Productos activos con menos de 5 ventas en el período</p>
          {loading
            ? <Skeleton className="h-48 w-full" />
            : (data?.lowRotation?.length ?? 0) === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">Todos los productos tienen buena rotación</p>
            : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {data!.lowRotation.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1 text-sm border-b last:border-0">
                    <span className="truncate">{p.name}</span>
                    <span className={`shrink-0 ml-2 font-semibold ${p.qty === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                      {p.qty === 0 ? 'Sin ventas' : `${p.qty} uds`}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>
      {/* Cuentas por cobrar (fiado) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold text-sm">Cuentas por cobrar</h2>
          {(data?.kpis.pendingCount ?? 0) > 0 && (
            <span className="ml-auto text-sm font-semibold text-amber-600">
              Total: {fmt(data?.kpis.totalPending ?? 0)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Pedidos cerrados con método de crédito aún sin cobrar (todos los períodos)
        </p>
        {loading
          ? <Skeleton className="h-32 w-full" />
          : (data?.pendingPayments?.length ?? 0) === 0
          ? <p className="text-sm text-muted-foreground py-8 text-center">No hay cuentas pendientes 🎉</p>
          : (
            <div className="space-y-0 divide-y text-sm">
              {data!.pendingPayments.map((p) => (
                <div key={p.id} className="flex items-start justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-amber-800 truncate">{p.customerName}</p>
                    {p.paymentNotes && (
                      <p className="text-xs text-muted-foreground truncate">{p.paymentNotes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {p.closedAt ? new Date(p.closedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-amber-700">{fmt(p.total)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
