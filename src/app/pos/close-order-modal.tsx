'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AlertCircle } from 'lucide-react'
import { formatCurrency, round2 } from '@/lib/utils'
import type { PaymentMethodConfig } from '@/lib/payment-methods'
import type { ActiveOrder } from './pos-store'
import type { OrderTotals as Totals } from '@/lib/order-calc'

interface Props {
  order: ActiveOrder
  totals: Totals
  currencySign: string
  paymentMethods: PaymentMethodConfig[]
  onClose: () => void
  onConfirm: (paymentData: {
    paymentMethod: string
    paymentNotes?: string
    customerName?: string
    cashReceived?: number
    tipAmount: number
  }) => Promise<void>
}

export function CloseOrderModal({ order, totals, currencySign, paymentMethods, onClose, onConfirm }: Props) {
  const defaultMethod = paymentMethods[0]?.key ?? 'cash'
  const [paymentMethod, setPaymentMethod] = useState(defaultMethod)
  const [paymentNotes, setPaymentNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [addTip, setAddTip] = useState(false)
  const [tipPercent, setTipPercent] = useState(10)
  const [loading, setLoading] = useState(false)

  const selectedMethod = paymentMethods.find((m) => m.key === paymentMethod)
  const isCredit = selectedMethod?.isCredit ?? false
  const fmt = (n: number) => formatCurrency(n, currencySign)

  const tip = (!isCredit && addTip) ? round2(totals.subtotal * (tipPercent / 100)) : 0
  const finalTotal = round2(totals.total + tip - totals.tip)

  const change = paymentMethod === 'cash' && cashReceived
    ? round2(parseFloat(cashReceived) - finalTotal)
    : null

  const isValid =
    (paymentMethod !== 'cash' || !cashReceived || parseFloat(cashReceived) >= finalTotal) &&
    (!isCredit || (customerName.trim().length > 0 && paymentNotes.trim().length > 0))

  async function handleConfirm() {
    setLoading(true)
    await onConfirm({
      paymentMethod,
      paymentNotes: paymentNotes.trim() || undefined,
      customerName: isCredit ? customerName.trim() : undefined,
      cashReceived: paymentMethod === 'cash' && cashReceived ? parseFloat(cashReceived) : undefined,
      tipAmount: tip,
    })
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCredit ? `Registrar ${selectedMethod?.label ?? 'pago pendiente'}` : 'Cerrar pedido y cobrar'}
          </DialogTitle>
        </DialogHeader>

        {/* Resumen */}
        <div className="rounded-lg border p-4 space-y-2 text-sm bg-muted/30">
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
          {tip > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Propina ({tipPercent}%)</span><span>{fmt(tip)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span><span>{fmt(finalTotal)}</span>
          </div>
        </div>

        {/* Propina (no aplica para fiado) */}
        {!isCredit && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={addTip} onCheckedChange={setAddTip} />
              <Label>Propina</Label>
            </div>
            {addTip && (
              <div className="flex gap-1">
                {[5, 10, 15].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setTipPercent(pct)}
                    className={`rounded px-2 py-1 text-xs font-medium border transition-colors ${
                      tipPercent === pct ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Método de pago */}
        <div className="space-y-2">
          <Label>Método de pago</Label>
          <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setCustomerName(''); setPaymentNotes(''); setCashReceived('') }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentMethods.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                  {m.isCredit && (
                    <span className="ml-2 text-xs text-amber-600 font-medium">(crédito)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Aviso fiado */}
        {isCredit && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>El pedido quedará cerrado pero <strong>sin cobrar</strong>. Aparecerá en el informe de cuentas por cobrar.</span>
          </div>
        )}

        {/* Efectivo */}
        {paymentMethod === 'cash' && (
          <div className="space-y-2">
            <Label>Valor recibido ($)</Label>
            <Input
              type="number"
              min={finalTotal}
              step="1000"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder={fmt(finalTotal)}
            />
            {change !== null && change >= 0 && (
              <p className="text-sm font-medium text-emerald-600">Vuelto: {fmt(change)}</p>
            )}
            {change !== null && change < 0 && (
              <p className="text-sm font-medium text-destructive">
                Monto insuficiente ({fmt(Math.abs(change))} menos)
              </p>
            )}
          </div>
        )}

        {/* Nombre del cliente — obligatorio para fiado */}
        {isCredit && (
          <div className="space-y-2">
            <Label>
              Nombre del cliente <span className="text-destructive">*</span>
            </Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre completo de quien debe"
              autoFocus
            />
            {customerName.trim().length === 0 && (
              <p className="text-xs text-destructive">Requerido para pagos pendientes</p>
            )}
          </div>
        )}

        {/* Observación — obligatoria para fiado, opcional para otros */}
        <div className="space-y-2">
          <Label>
            Observación del pago
            {isCredit ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground text-xs"> (opcional)</span>}
          </Label>
          <Input
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder={isCredit ? 'Motivo, plazo de pago, referencia...' : 'Número de referencia, etc.'}
          />
          {isCredit && paymentNotes.trim().length === 0 && (
            <p className="text-xs text-destructive">Requerido para pagos pendientes</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || loading}
            loading={loading}
            variant={isCredit ? 'outline' : 'default'}
            className={isCredit ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : ''}
          >
            {isCredit ? 'Registrar deuda' : 'Confirmar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
