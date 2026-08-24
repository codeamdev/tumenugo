'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { formatCurrency, round2 } from '@/lib/utils'
import type { PaymentMethodConfig } from '@/lib/payment-methods'
import type { ActiveOrder } from './pos-store'
import type { OrderTotals as Totals } from '@/lib/order-calc'

interface PaymentLine { method: string; amount: string }

export interface ClosePaymentData {
  payments: { method: string; amount: number }[]
  customerName?: string
  paymentNotes?: string
}

interface Props {
  order: ActiveOrder
  totals: Totals
  currencySign: string
  paymentMethods: PaymentMethodConfig[]
  onClose: () => void
  onConfirm: (paymentData: ClosePaymentData) => Promise<void>
}

const QUICK_AMOUNTS = [10_000, 20_000, 50_000, 100_000]

export function CloseOrderModal({ order: _order, totals, currencySign, paymentMethods, onClose, onConfirm }: Props) {
  const defaultMethod = paymentMethods[0]?.key ?? 'cash'
  const [lines, setLines] = useState<PaymentLine[]>([{ method: defaultMethod, amount: '' }])
  const [customerName, setCustomerName] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const grandTotal = totals.total
  const fmt = (n: number) => formatCurrency(n, currencySign)

  const totalPaid = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = round2(grandTotal - totalPaid)

  const firstMethod = paymentMethods.find((m) => m.key === lines[0]?.method)
  const isCredit = firstMethod?.isCredit ?? false

  // Auto-fill total when switching to credit method
  useEffect(() => {
    if (isCredit) {
      setLines((prev) => [{ method: prev[0]?.method ?? defaultMethod, amount: String(Math.round(grandTotal)) }])
    }
  }, [isCredit, grandTotal, defaultMethod])

  function fmtNum(raw: string) {
    const n = raw.replace(/\D/g, '')
    return n ? parseInt(n, 10).toLocaleString('es-CO') : ''
  }

  function updateLine(idx: number, field: keyof PaymentLine, value: string) {
    const stored = field === 'amount' ? value.replace(/\D/g, '') : value
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: stored } : l))
  }

  function addLine() {
    setLines((prev) => [...prev, { method: defaultMethod, amount: remaining > 0 ? String(Math.round(remaining)) : '' }])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const isValid =
    lines.some((l) => parseFloat(l.amount) > 0) &&
    remaining <= 0.01 &&
    (!isCredit || customerName.trim().length > 0) &&
    (!isCredit || paymentNotes.trim().length > 0)

  async function handleConfirm() {
    setLoading(true)
    const validPayments = lines
      .map((l) => ({ method: l.method, amount: parseFloat(l.amount) || 0 }))
      .filter((l) => l.amount > 0)
    await onConfirm({
      payments: validPayments,
      customerName: isCredit ? customerName.trim() : undefined,
      paymentNotes: isCredit ? paymentNotes.trim() : undefined,
    })
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCredit ? `Registrar ${firstMethod?.label ?? 'pago pendiente'}` : 'Cobrar pedido'}
          </DialogTitle>
        </DialogHeader>

        {/* Resumen */}
        <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/30">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
          </div>
          {totals.taxLines.map((t) => (
            <div key={t.taxRateId} className="flex justify-between text-muted-foreground">
              <span>{t.name} ({t.rate}%)</span><span>{fmt(t.amount)}</span>
            </div>
          ))}
          {totals.deliveryFee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Domicilio</span><span>{fmt(totals.deliveryFee)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>Total</span><span>{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* Pagos */}
        <div className="space-y-2">
          <Label>Pagos recibidos</Label>
          {lines.map((line, idx) => (
            <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
              {/* Chips de método */}
              <div className="flex flex-wrap gap-1.5">
                {paymentMethods.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => updateLine(idx, 'method', m.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      line.method === m.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {m.label}
                    {m.isCredit && <span className="ml-1 text-[10px] opacity-70">(crédito)</span>}
                  </button>
                ))}
              </div>
              {/* Monto (oculto para crédito — se auto-completa) */}
              {!isCredit && (
                <div className="flex gap-2 items-center">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={idx === 0 ? fmt(grandTotal) : '0'}
                    value={fmtNum(line.amount)}
                    onChange={(e) => updateLine(idx, 'amount', e.target.value)}
                    className="flex-1"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {!isCredit && (
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar otra forma de pago
          </button>
        )}
        </div>

        {/* Montos rápidos (ocultos para crédito) */}
        {!isCredit && (
          <div className="space-y-1.5">
            <Label>Monto rápido</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => updateLine(0, 'amount', String(amt))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-primary text-primary hover:bg-primary/10 transition-colors"
                >
                  +{amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updateLine(0, 'amount', String(Math.round(grandTotal)))}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-primary text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                Exacto
              </button>
            </div>
          </div>
        )}

        {/* Balance */}
        {totalPaid > 0 && (
          <div className={`rounded-lg border p-3 flex justify-between items-center text-sm ${
            remaining <= 0
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
              : 'bg-destructive/10 border-destructive/30'
          }`}>
            <span className="font-medium text-foreground">
              {remaining < -0.01 ? 'Cambio a devolver' : remaining > 0.01 ? 'Falta por cubrir' : 'Cuadra exacto ✓'}
            </span>
            {Math.abs(remaining) > 0.01 && (
              <span className="font-bold text-base">{fmt(Math.abs(remaining))}</span>
            )}
          </div>
        )}

        {/* Aviso fiado */}
        {isCredit && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>El pedido quedará cerrado pero <strong>sin cobrar</strong>. Aparecerá en el informe de cuentas por cobrar.</span>
          </div>
        )}

        {/* Nombre — obligatorio para crédito */}
        {isCredit && (
          <div className="space-y-1.5">
            <Label>
              Nombre del cliente <span className="text-destructive">*</span>
            </Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre completo de quien debe"
              autoFocus
            />
          </div>
        )}

        {/* Observaciones — obligatorio para crédito */}
        {isCredit && (
          <div className="space-y-1.5">
            <Label>
              Observaciones <span className="text-destructive">*</span>
            </Label>
            <Input
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Motivo, plazo de pago, referencia..."
            />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || loading}
            loading={loading}
            variant={isCredit ? 'outline' : 'default'}
            className={`flex-1 ${isCredit ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : ''}`}
          >
            {isCredit ? 'Registrar deuda' : 'Confirmar cobro'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
