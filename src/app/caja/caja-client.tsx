'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert } from '@/components/ui/alert'
import { formatCurrency, formatDateTime, round2 } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'
import {
  LockOpen, Lock, DollarSign, ShoppingBag, TrendingUp, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

interface CashRegister {
  id: string
  openedAt: string | null
  closedAt: string | null
  openingAmount: string
  expectedCash: string | null
  countedCash: string | null
  difference: string | null
  notes: string | null
  status: string
}

interface Summary {
  totalOrders: number
  totalSales: number
  totalTips: number
  byPaymentMethod: Record<string, number>
  expectedCash: number
}

interface Props {
  register: CashRegister | null
  summary: Summary | null
  history: CashRegister[]
  currencySign: string
  paymentMethodLabels: Record<string, string>
  defaultOpeningAmount?: number
}

export function CajaClient({ register, summary, history, currencySign, paymentMethodLabels, defaultOpeningAmount = 0 }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [openingAmount, setOpeningAmount] = useState(defaultOpeningAmount > 0 ? String(defaultOpeningAmount) : '')
  const [openNotes, setOpenNotes] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const fmt = (n: number) => formatCurrency(n, currencySign)

  const difference = summary && countedCash
    ? round2(parseFloat(countedCash) - summary.expectedCash)
    : null

  async function handleOpen() {
    setLoading(true)
    try {
      const res = await fetch('/api/tenant/caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          openingAmount: parseFloat(openingAmount) || 0,
          notes: openNotes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Caja abierta', description: 'La caja ha sido abierta exitosamente.' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    if (!countedCash) return
    setLoading(true)
    try {
      const res = await fetch('/api/tenant/caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          countedCash: parseFloat(countedCash),
          notes: closeNotes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Caja cerrada', description: 'El cierre de caja se realizó correctamente.' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-full p-2 ${register ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {register ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold">Caja</h1>
          <p className="text-sm text-muted-foreground">
            {register
              ? `Turno abierto desde ${formatDateTime(register.openedAt!)}`
              : 'No hay turno activo'}
          </p>
        </div>
        <Badge
          variant={register ? 'success' : 'secondary'}
          className="ml-auto text-sm px-3 py-1"
        >
          {register ? 'Abierta' : 'Cerrada'}
        </Badge>
      </div>

      {/* ── No register: open form ─────────────────────────────────────────────── */}
      {!register && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <LockOpen className="h-4 w-4" />
            Apertura de caja
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Efectivo en caja al iniciar ({currencySign})</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Dinero físico con el que inicia el turno
              </p>
            </div>
            <div className="space-y-2">
              <Label>Observaciones (opcional)</Label>
              <Input
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="Turno mañana, etc."
              />
            </div>
          </div>
          <Button onClick={handleOpen} loading={loading} className="w-full sm:w-auto">
            <LockOpen className="h-4 w-4 mr-2" />
            Abrir caja
          </Button>
        </Card>
      )}

      {/* ── Open register: summary + close form ───────────────────────────────── */}
      {register && summary && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium">Pedidos</p>
              <p className="text-2xl font-bold">{summary.totalOrders}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium">Ventas</p>
              <p className="text-2xl font-bold">{fmt(summary.totalSales)}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium">Propinas</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(summary.totalTips)}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium">Efectivo esperado</p>
              <p className="text-2xl font-bold">{fmt(summary.expectedCash)}</p>
            </Card>
          </div>

          {/* Sales by payment method */}
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Ventas por método de pago
            </h2>
            <div className="space-y-2">
              {Object.entries(summary.byPaymentMethod).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin ventas en este turno</p>
              )}
              {Object.entries(summary.byPaymentMethod).map(([method, amount]) => (
                <div key={method} className="flex justify-between items-center">
                  <span className="text-sm">
                    {paymentMethodLabels[method] ?? method}
                  </span>
                  <span className="font-medium">{fmt(amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center font-bold">
                <span>Fondo inicial</span>
                <span>{fmt(parseFloat(register.openingAmount ?? '0'))}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-lg">
                <span>Efectivo esperado en caja</span>
                <span>{fmt(summary.expectedCash)}</span>
              </div>
            </div>
          </Card>

          {/* Close register form */}
          <Card className="p-5 space-y-4 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900">
            <h2 className="font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Lock className="h-4 w-4" />
              Cierre de caja / Arqueo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Efectivo contado en caja ({currencySign})</Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder={String(summary.expectedCash)}
                />
                {difference !== null && (
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${
                    difference === 0
                      ? 'text-emerald-600'
                      : difference > 0
                      ? 'text-blue-600'
                      : 'text-destructive'
                  }`}>
                    {difference === 0
                      ? <CheckCircle className="h-4 w-4" />
                      : <AlertTriangle className="h-4 w-4" />}
                    {difference === 0
                      ? 'Cuadra perfectamente'
                      : difference > 0
                      ? `Sobrante: ${fmt(difference)}`
                      : `Faltante: ${fmt(Math.abs(difference))}`}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Observaciones del cierre</Label>
                <Input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Todo en orden, etc."
                />
              </div>
            </div>
            {difference !== null && difference < 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>Hay un faltante de {fmt(Math.abs(difference))}. Verifique el conteo antes de cerrar.</span>
              </Alert>
            )}
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={!countedCash || loading}
              loading={loading}
            >
              <Lock className="h-4 w-4 mr-2" />
              Cerrar caja
            </Button>
          </Card>
        </>
      )}

      {/* ── History ───────────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <Card className="p-5 space-y-3">
          <button
            className="flex items-center justify-between w-full font-semibold"
            onClick={() => setShowHistory((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Cierres anteriores
            </span>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showHistory && (
            <div className="space-y-3 pt-2">
              {history.map((h) => {
                const diff = h.difference ? parseFloat(h.difference) : null
                return (
                  <div key={h.id} className="rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{formatDateTime(h.closedAt!)}</span>
                      {diff !== null && (
                        <Badge variant={diff === 0 ? 'success' : diff > 0 ? 'default' : 'destructive'}>
                          {diff > 0 ? '+' : ''}{formatCurrency(diff, currencySign)}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground text-xs">
                      <div>Inicial: <span className="text-foreground font-medium">{formatCurrency(parseFloat(h.openingAmount), currencySign)}</span></div>
                      <div>Esperado: <span className="text-foreground font-medium">{h.expectedCash ? formatCurrency(parseFloat(h.expectedCash), currencySign) : '—'}</span></div>
                      <div>Contado: <span className="text-foreground font-medium">{h.countedCash ? formatCurrency(parseFloat(h.countedCash), currencySign) : '—'}</span></div>
                    </div>
                    {h.notes && <p className="text-xs text-muted-foreground italic">{h.notes}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
