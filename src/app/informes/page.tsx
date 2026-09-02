'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Download, TrendingUp, ShoppingBag, AlertTriangle, Clock, XCircle } from 'lucide-react'
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

interface CancelledOrder {
  id: string
  displayCode: string | null
  createdAt: string | null
  total: number
  customerName: string | null
  type: string
  tableName: string | null
}

interface PaymentMethodCfg { key: string; label: string; isCredit?: boolean }

interface ReportData {
  period: { from: string; to: string }
  currencySign: string
  paymentMethods: PaymentMethodCfg[]
  kpis: { totalSales: number; totalOrders: number; totalPending: number; pendingCount: number }
  byMethod: Record<string, number>
  paymentMethodLabels: Record<string, string>
  byType: Record<string, number>
  dailySeries: { date: string; sales: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  byCategory: { name: string; emoji: string | null; revenue: number; qty: number }[]
  lowRotation: { name: string; qty: number }[]
  pendingPayments: PendingPayment[]
  cancelledOrders: CancelledOrder[]
  cancelledKpis: { count: number; totalLost: number }
}

function todayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMondayISO() {
  const now = new Date()
  const day = now.getDay() // 0=Dom
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function getSundayISO() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 0 : 7 - day
  const sun = new Date(now)
  sun.setDate(now.getDate() + diff)
  return sun.toISOString().slice(0, 10)
}

function getMonthFirstISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthLastISO() {
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

const QUICK_RANGES = [
  { label: 'Turno', key: 'shift' },
  { label: 'Semana', key: 'week' },
  { label: 'Mes', key: 'month' },
]

interface CollectState {
  orderId: string
  customerName: string
  total: number
  method: string
  amount: string
  notes: string
  saving: boolean
}

export default function InformesPage() {
  const [useShift, setUseShift] = useState(true)
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [collect, setCollect] = useState<CollectState | null>(null)

  const fmt = (n: number) => formatCurrency(n, data?.currencySign ?? '$')

  async function load() {
    setLoading(true)
    try {
      const url = useShift
        ? '/api/tenant/informes?range=shift'
        : `/api/tenant/informes?from=${from}&to=${to}`
      const res = await fetch(url)
      const json = await res.json()
      setData(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to, useShift])

  function setRange(key: string) {
    if (key === 'shift') { setUseShift(true); return }
    setUseShift(false)
    if (key === 'week') { setFrom(getMondayISO()); setTo(getSundayISO()); return }
    if (key === 'month') { setFrom(getMonthFirstISO()); setTo(getMonthLastISO()); return }
  }

  function openCollect(p: PendingPayment) {
    const methods = (data?.paymentMethods ?? []).filter((m) => !m.isCredit)
    setCollect({
      orderId: p.id,
      customerName: p.customerName,
      total: p.total,
      method: methods[0]?.key ?? 'cash',
      amount: String(p.total),
      notes: '',
      saving: false,
    })
  }

  async function saveCollect() {
    if (!collect) return
    setCollect((c) => c && ({ ...c, saving: true }))
    try {
      const res = await fetch(`/api/tenant/orders/${collect.orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'collect_credit',
          payments: [{ method: collect.method, amount: parseFloat(collect.amount) || collect.total }],
          paymentNotes: collect.notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Error al cobrar')
        setCollect((c) => c && ({ ...c, saving: false }))
        return
      }
      setCollect(null)
      load()
    } catch {
      setCollect((c) => c && ({ ...c, saving: false }))
    }
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
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                (r.key === 'shift' && useShift) || (r.key !== 'shift' && !useShift && from === (r.key === 'week' ? getMondayISO() : getMonthFirstISO()))
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              }`}
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
              onChange={(e) => { setUseShift(false); setFrom(e.target.value) }}
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
              onChange={(e) => { setUseShift(false); setTo(e.target.value) }}
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
                <div key={p.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-800 truncate">{p.customerName}</p>
                    {p.paymentNotes && (
                      <p className="text-xs text-muted-foreground truncate">{p.paymentNotes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {p.closedAt ? new Date(p.closedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-amber-700">{fmt(p.total)}</span>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-green-600 text-green-700 hover:bg-green-50" onClick={() => openCollect(p)}>
                      Cobrar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
      {/* Pedidos cancelados */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <h2 className="font-semibold text-sm">Pedidos cancelados</h2>
          {(data?.cancelledKpis.count ?? 0) > 0 && (
            <span className="ml-auto text-sm font-semibold text-red-600">
              {data!.cancelledKpis.count} pedido{data!.cancelledKpis.count !== 1 ? 's' : ''} · {fmt(data!.cancelledKpis.totalLost)} no cobrado{data!.cancelledKpis.count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Pedidos anulados creados en el período seleccionado</p>
        {loading
          ? <Skeleton className="h-32 w-full" />
          : (data?.cancelledOrders?.length ?? 0) === 0
          ? <p className="text-sm text-muted-foreground py-8 text-center">Sin pedidos cancelados en el período 🎉</p>
          : (
            <div className="space-y-0 divide-y text-sm">
              {data!.cancelledOrders.map((o) => (
                <div key={o.id} className="flex items-start justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-red-700 dark:text-red-400">
                      {o.displayCode ?? '#' + o.id.slice(-6).toUpperCase()}
                      {o.tableName && <span className="ml-1.5 font-normal text-muted-foreground">· Mesa {o.tableName}</span>}
                      {!o.tableName && o.type === 'delivery' && <span className="ml-1.5 font-normal text-muted-foreground">· Domicilio</span>}
                    </p>
                    {o.customerName && <p className="text-xs text-muted-foreground truncate">{o.customerName}</p>}
                    <p className="text-xs text-muted-foreground">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-red-600 line-through">{fmt(o.total)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>
      {/* Modal: cobrar pendiente */}
      {collect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !collect.saving && setCollect(null)}>
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-base">Cobrar deuda — {collect.customerName}</h2>
            <p className="text-sm text-muted-foreground">Total pendiente: <span className="font-semibold text-foreground">{fmt(collect.total)}</span></p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Forma de pago</label>
              <div className="flex flex-wrap gap-2">
                {(data?.paymentMethods ?? []).filter((m) => !m.isCredit).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setCollect((c) => c && ({ ...c, method: m.key }))}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${collect.method === m.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                  >{m.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Monto recibido</label>
              <Input
                type="number"
                value={collect.amount}
                onChange={(e) => setCollect((c) => c && ({ ...c, amount: e.target.value }))}
                placeholder={String(collect.total)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Observaciones (opcional)</label>
              <Input
                value={collect.notes}
                onChange={(e) => setCollect((c) => c && ({ ...c, notes: e.target.value }))}
                placeholder="Ej: pagó en dos cuotas..."
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCollect(null)} disabled={collect.saving}>Cancelar</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={saveCollect} disabled={collect.saving}>
                {collect.saving ? 'Guardando...' : 'Confirmar cobro'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
