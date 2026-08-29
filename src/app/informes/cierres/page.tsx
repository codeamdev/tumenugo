'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface CashRegister {
  id: string
  openedAt: string | null
  closedAt: string | null
  openingAmount: string
  expectedCash: string | null
  countedCash: string | null
  difference: string | null
  countedByMethod: Record<string, number> | null
  notes: string | null
  status: string
}

export default function CierresPage() {
  const [history, setHistory] = useState<CashRegister[]>([])
  const [currencySign, setCurrencySign] = useState('$')
  const [methodLabels, setMethodLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tenant/caja?type=history')
      .then((r) => r.json())
      .then((json) => {
        setHistory(json.data?.history ?? [])
        setCurrencySign(json.data?.currencySign ?? '$')
        setMethodLabels(json.data?.paymentMethodLabels ?? {})
      })
      .catch(() => setError('No se pudo cargar el historial'))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n: number) => formatCurrency(n, currencySign)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full p-2 bg-cyan-100 text-cyan-700">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Informe de cierres</h1>
          <p className="text-sm text-muted-foreground">Historial de cierres de caja registrados</p>
        </div>
      </div>

      {loading && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Cargando cierres...</p>
        </Card>
      )}

      {error && (
        <Card className="p-6 border-destructive">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {!loading && !error && history.length === 0 && (
        <Card className="p-8 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No hay cierres de caja registrados.</p>
        </Card>
      )}

      {!loading && history.length > 0 && (
        <div className="space-y-3">
          {history.map((h) => {
            const diff = h.difference ? parseFloat(h.difference) : null
            const hasDiff = diff !== null && Math.abs(diff) > 0.01
            const base = parseFloat(h.openingAmount ?? '0')
            const cashSales = h.expectedCash ? parseFloat(h.expectedCash) : null
            const otherMethods = h.countedByMethod
              ? Object.entries(h.countedByMethod).filter(([k]) => k !== 'cash')
              : []
            return (
              <Card key={h.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasDiff
                      ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                      : <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    <span className="font-semibold text-sm">
                      {h.closedAt ? formatDateTime(h.closedAt) : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Turno: {h.openedAt ? formatDateTime(h.openedAt) : '—'} → {h.closedAt ? formatDateTime(h.closedAt) : '—'}
                    </span>
                  </div>
                  {diff !== null && (
                    <Badge variant={hasDiff ? (diff > 0 ? 'default' : 'destructive') : 'success'}>
                      {hasDiff ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : 'Exacto'}
                    </Badge>
                  )}
                </div>

                {/* Efectivo */}
                <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Efectivo</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Ventas ef. esperadas</p>
                      <p className="font-semibold">{cashSales !== null ? fmt(cashSales) : '—'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Contado (sin fondo)</p>
                      <p className={`font-semibold ${hasDiff ? (diff! > 0 ? 'text-blue-600' : 'text-destructive') : 'text-emerald-600'}`}>
                        {h.countedCash ? fmt(parseFloat(h.countedCash)) : '—'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Fondo inicial</p>
                      <p className="font-semibold text-muted-foreground">{fmt(base)}</p>
                    </div>
                  </div>
                </div>

                {/* Otros métodos contados */}
                {otherMethods.length > 0 && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Otros métodos</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      {otherMethods.map(([method, counted]) => (
                        <div key={method} className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">{methodLabels[method] ?? method}</p>
                          <p className="font-semibold">{fmt(counted)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {h.notes && (
                  <p className="text-xs text-muted-foreground italic border-t pt-2">{h.notes}</p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
