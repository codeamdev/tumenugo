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
  openingAmount: number
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
  const [countedByMethod, setCountedByMethod] = useState<Record<string, string>>({})
  const [closeNotes, setCloseNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const fmt = (n: number) => formatCurrency(n, currencySign)

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

  // Compute total difference across all methods
  const totalDiff = summary
    ? round2(
        Object.entries(summary.byPaymentMethod).reduce((acc, [method, expected]) => {
          const counted = parseFloat(countedByMethod[method] ?? '0') || 0
          return acc + (counted - expected)
        }, 0)
      )
    : 0
  const hasDifference = Math.abs(totalDiff) > 0.01
  const notesRequired = hasDifference && !closeNotes.trim()

  async function handleClose() {
    if (!summary || !countedByMethod['cash']) return
    if (notesRequired) {
      toast({ title: 'Observación requerida', description: 'Hay una diferencia en el arqueo. Describe el motivo en las observaciones.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const methodsToShow = [
        'cash',
        ...Object.entries(summary.byPaymentMethod)
          .filter(([k, v]) => k !== 'cash' && v > 0)
          .map(([k]) => k),
      ]
      const countedByMethodNums: Record<string, number> = {}
      for (const m of methodsToShow) {
        countedByMethodNums[m] = parseFloat(countedByMethod[m] ?? '0') || 0
      }
      const res = await fetch('/api/tenant/caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          countedByMethod: countedByMethodNums,
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
              <p className="text-xs text-muted-foreground uppercase font-medium">Ventas efectivo</p>
              <p className="text-2xl font-bold">{fmt(summary.byPaymentMethod['cash'] ?? 0)}</p>
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
                  <span className="text-sm">{paymentMethodLabels[method] ?? method}</span>
                  <span className="font-medium">{fmt(amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center font-bold text-lg">
                <span>Total ventas</span>
                <span>{fmt(summary.totalSales)}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Fondo inicial (no es venta)</span>
                <span>{fmt(parseFloat(register.openingAmount ?? '0'))}</span>
              </div>
            </div>
          </Card>

          {/* Close register form */}
          <Card className="p-5 space-y-4 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900">
            <h2 className="font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Lock className="h-4 w-4" />
              Cierre de caja / Arqueo
            </h2>

            <div className="space-y-3">
              {/* Efectivo */}
              {(() => {
                const cashExpected = summary.byPaymentMethod['cash'] ?? 0
                const rawCash = countedByMethod['cash'] ?? ''
                const cashCounted = rawCash !== '' ? parseFloat(rawCash) : null
                const cashDiff = cashCounted !== null ? round2(cashCounted - cashExpected) : null
                return (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Efectivo</span>
                      <span className="text-sm text-muted-foreground">Esperado: {fmt(cashExpected)}</span>
                    </div>
                    {parseFloat(register.openingAmount ?? '0') > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Fondo inicial {fmt(parseFloat(register.openingAmount ?? '0'))} — no incluir en el conteo
                      </p>
                    )}
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={rawCash ? parseInt(rawCash, 10).toLocaleString('es-CO') : ''}
                      onChange={(e) => setCountedByMethod((prev) => ({ ...prev, cash: e.target.value.replace(/\D/g, '') }))}
                      placeholder={String(cashExpected)}
                    />
                    {cashDiff !== null && (
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${cashDiff === 0 ? 'text-emerald-600' : cashDiff > 0 ? 'text-blue-600' : 'text-destructive'}`}>
                        {cashDiff === 0 ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        {cashDiff === 0 ? 'Cuadra perfectamente' : cashDiff > 0 ? `Sobrante: ${fmt(cashDiff)}` : `Faltante: ${fmt(Math.abs(cashDiff))}`}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Otros métodos */}
              {Object.entries(summary.byPaymentMethod)
                .filter(([k, v]) => k !== 'cash' && v > 0)
                .map(([method, expectedVal]) => {
                  const rawVal = countedByMethod[method] ?? ''
                  const counted = rawVal !== '' ? parseFloat(rawVal) : null
                  const diff = counted !== null ? round2(counted - expectedVal) : null
                  return (
                    <div key={method} className="rounded-lg border p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{paymentMethodLabels[method] ?? method}</span>
                        <span className="text-sm text-muted-foreground">Esperado: {fmt(expectedVal)}</span>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={rawVal ? parseInt(rawVal, 10).toLocaleString('es-CO') : ''}
                        onChange={(e) => setCountedByMethod((prev) => ({ ...prev, [method]: e.target.value.replace(/\D/g, '') }))}
                        placeholder={String(expectedVal)}
                      />
                      {diff !== null && (
                        <div className={`flex items-center gap-1.5 text-sm font-medium ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-destructive'}`}>
                          {diff === 0 ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          {diff === 0 ? 'Cuadra perfectamente' : diff > 0 ? `Sobrante: ${fmt(diff)}` : `Faltante: ${fmt(Math.abs(diff))}`}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>

            {hasDifference && (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span className="ml-2 font-medium">
                  Diferencia de {totalDiff > 0 ? `+${fmt(totalDiff)}` : fmt(totalDiff)} — se requiere observación para cerrar.
                </span>
              </Alert>
            )}

            <div className="space-y-2">
              <Label className={notesRequired ? 'text-destructive' : ''}>
                Observaciones {hasDifference ? '(obligatorio)' : '(opcional)'}
              </Label>
              <Input
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder={hasDifference ? 'Describe el motivo de la diferencia...' : 'Todo en orden, etc.'}
                className={notesRequired ? 'border-destructive' : ''}
              />
            </div>

            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={!countedByMethod['cash'] || loading || notesRequired}
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
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-2 font-semibold"
              onClick={() => setShowHistory((v) => !v)}
            >
              <TrendingUp className="h-4 w-4" />
              Cierres anteriores
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <a href="/informes/cierres" className="text-xs text-primary hover:underline">Ver todos →</a>
          </div>
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
