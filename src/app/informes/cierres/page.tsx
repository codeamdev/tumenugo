'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
  salesByMethod: Record<string, number>
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
  const label = (key: string) => methodLabels[key] ?? key

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
        <div className="space-y-4">
          {history.map((h) => {
            const diff = h.difference ? parseFloat(h.difference) : null
            const hasDiff = diff !== null && Math.abs(diff) > 0.01
            const salesByMethod = h.salesByMethod ?? {}
            const allMethodKeys = Array.from(new Set([
              ...Object.keys(salesByMethod),
              ...Object.keys(h.countedByMethod ?? {}),
            ]))
            const totalSales = Object.values(salesByMethod).reduce((s, v) => s + v, 0)

            return (
              <Card key={h.id} className="p-5 space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {hasDiff
                      ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      : <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                    <div>
                      <p className="font-semibold text-sm">
                        Cerrado: {h.closedAt ? formatDateTime(h.closedAt) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Apertura: {h.openedAt ? formatDateTime(h.openedAt) : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Total ventas:</span>
                    <span className="font-bold">{fmt(totalSales)}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${hasDiff ? (diff! > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700') : 'bg-emerald-100 text-emerald-700'}`}>
                      {hasDiff ? `${diff! > 0 ? '+' : ''}${fmt(diff!)}` : 'Exacto'}
                    </span>
                  </div>
                </div>

                <Separator />

                {/* Tabla de métodos de pago */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formas de pago</p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Método</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ventas</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Contado</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {allMethodKeys.map((key) => {
                          const sold = salesByMethod[key] ?? 0
                          const counted = h.countedByMethod?.[key] ?? sold
                          const rowDiff = counted - sold
                          const rowHasDiff = Math.abs(rowDiff) > 0.01
                          return (
                            <tr key={key} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium">{label(key)}</td>
                              <td className="px-3 py-2 text-right">{fmt(sold)}</td>
                              <td className="px-3 py-2 text-right">{fmt(counted)}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${rowHasDiff ? (rowDiff > 0 ? 'text-blue-600' : 'text-destructive') : 'text-emerald-600'}`}>
                                {rowHasDiff ? `${rowDiff > 0 ? '+' : ''}${fmt(rowDiff)}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t bg-muted/30">
                        <tr>
                          <td className="px-3 py-2 font-bold">Total</td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(totalSales)}</td>
                          <td className="px-3 py-2 text-right font-bold">
                            {fmt(Object.values(h.countedByMethod ?? {}).reduce((s, v) => s + v, 0) || totalSales)}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${hasDiff ? (diff! > 0 ? 'text-blue-600' : 'text-destructive') : 'text-emerald-600'}`}>
                            {hasDiff ? `${diff! > 0 ? '+' : ''}${fmt(diff!)}` : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Fondo inicial */}
                {parseFloat(h.openingAmount ?? '0') > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Fondo inicial: <span className="font-medium">{fmt(parseFloat(h.openingAmount))}</span> (no incluido en ventas)
                  </p>
                )}

                {/* Observaciones */}
                {h.notes && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Observaciones</p>
                    <p className="text-sm text-amber-900 dark:text-amber-200">{h.notes}</p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
