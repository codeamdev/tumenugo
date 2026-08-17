'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'
import { Settings, CheckCircle, Truck, CreditCard, DollarSign, LockOpen, Plus, Trash2, Bell, GlassWater } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface PaymentMethodConfig {
  key: string
  label: string
  isCredit: boolean
}

interface TenantConfig {
  id: string
  currencySign: string | null
  posConfig: {
    deliveryFields: { phone: boolean; address: boolean; notes: boolean; fee: boolean }
    paymentMethods?: { key: string; label: string; isCredit?: boolean }[] | string[]
    kitchenAlertMinutes?: number
    barEnabled?: boolean
  } | null
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { key: 'cash',      label: 'Efectivo',       isCredit: false },
  { key: 'card',      label: 'Tarjeta',         isCredit: false },
  { key: 'transfer',  label: 'Transferencia',   isCredit: false },
  { key: 'nequi',     label: 'Nequi',           isCredit: false },
  { key: 'daviplata', label: 'Daviplata',       isCredit: false },
  { key: 'other',     label: 'Otro',            isCredit: false },
]

const DEFAULT_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_PAYMENT_METHODS.map((m) => [m.key, m.label])
)

function normalizePaymentMethods(raw: unknown): PaymentMethodConfig[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return DEFAULT_PAYMENT_METHODS
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((k) => ({ key: k, label: DEFAULT_LABELS[k] ?? k, isCredit: k === 'fiado' }))
  }
  return (raw as { key: string; label: string; isCredit?: boolean }[]).map((m) => ({
    key: m.key,
    label: m.label,
    isCredit: m.isCredit ?? (m.key === 'fiado'),
  }))
}


export default function ConfiguracionPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [form, setForm] = useState({
    currencySign: '$',
    deliveryPhone: true,
    deliveryAddress: true,
    deliveryNotes: true,
    deliveryFee: true,
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    defaultOpeningAmount: 0,
    defaultDeliveryFee: 0,
    kitchenAlertMinutes: 0,
    barEnabled: false,
  })

  useEffect(() => {
    fetch('/api/tenant/configuracion')
      .then((r) => r.json())
      .then((json) => {
        const d = json.data
        setConfig(d)
        setForm({
          currencySign: d.currencySign ?? '$',
          deliveryPhone: d.posConfig?.deliveryFields?.phone ?? true,
          deliveryAddress: d.posConfig?.deliveryFields?.address ?? true,
          deliveryNotes: d.posConfig?.deliveryFields?.notes ?? true,
          deliveryFee: d.posConfig?.deliveryFields?.fee ?? true,
          paymentMethods: normalizePaymentMethods(d.posConfig?.paymentMethods),
          defaultOpeningAmount: d.posConfig?.defaultOpeningAmount ?? 0,
          defaultDeliveryFee: d.posConfig?.defaultDeliveryFee ?? 0,
          kitchenAlertMinutes: d.posConfig?.kitchenAlertMinutes ?? 0,
          barEnabled: d.posConfig?.barEnabled ?? false,
        })
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/tenant/configuracion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currencySign: form.currencySign,
          posConfig: {
            deliveryFields: {
              phone: form.deliveryPhone,
              address: form.deliveryAddress,
              notes: form.deliveryNotes,
              fee: form.deliveryFee,
            },
            paymentMethods: form.paymentMethods,
            defaultOpeningAmount: form.defaultOpeningAmount,
            defaultDeliveryFee: form.defaultDeliveryFee,
            ...(form.kitchenAlertMinutes > 0 ? { kitchenAlertMinutes: form.kitchenAlertMinutes } : {}),
            barEnabled: form.barEnabled,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: json.error || 'No se pudo guardar', variant: 'destructive' })
        return
      }
      toast({ title: 'Guardado', description: 'Configuración actualizada correctamente.' })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full p-2 bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold">Configuración</h1>
      </div>

      {/* Currency */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Moneda
        </h2>
        <div className="space-y-2 max-w-xs">
          <Label>Signo de moneda</Label>
          <Input
            value={form.currencySign}
            onChange={(e) => setForm((f) => ({ ...f, currencySign: e.target.value }))}
            maxLength={5}
            placeholder="$"
          />
        </div>
      </Card>

      {/* Delivery fields */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4" /> Campos de domicilio
        </h2>
        <p className="text-sm text-muted-foreground">
          Configura qué campos se muestran al crear un pedido a domicilio.
        </p>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'deliveryPhone', label: 'Teléfono' },
            { key: 'deliveryAddress', label: 'Dirección' },
            { key: 'deliveryNotes', label: 'Observaciones' },
            { key: 'deliveryFee', label: 'Valor domicilio' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border-2 transition-all ${
                form[key]
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-slate-50 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${form[key] ? 'bg-primary' : 'bg-slate-300'}`} />
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-2 max-w-xs pt-2">
          <Label>Valor domicilio por defecto ({form.currencySign || '$'})</Label>
          <Input
            type="number"
            min="0"
            step="500"
            value={form.defaultDeliveryFee}
            onChange={(e) => setForm((f) => ({ ...f, defaultDeliveryFee: Number(e.target.value) }))}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Se pre-carga automáticamente al crear un pedido a domicilio.
          </p>
        </div>
      </Card>

      {/* Cash register */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <LockOpen className="h-4 w-4" /> Caja
        </h2>
        <div className="space-y-2 max-w-xs">
          <Label>Fondo de apertura por defecto ($)</Label>
          <Input
            type="number"
            min="0"
            step="1000"
            value={form.defaultOpeningAmount}
            onChange={(e) => setForm((f) => ({ ...f, defaultOpeningAmount: Number(e.target.value) }))}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Monto de efectivo con el que se abre la caja automáticamente en el primer cobro del día.
          </p>
        </div>
      </Card>

      {/* Barra */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="font-semibold flex items-center gap-2">
              <GlassWater className="h-4 w-4" /> Barra
            </h2>
            <p className="text-sm text-muted-foreground">
              Activa el tipo de pedido "Barra" para atención en mostrador. Los pedidos de barra usan el código BAR-001, BAR-002…
            </p>
          </div>
          <Switch
            checked={form.barEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, barEnabled: v }))}
          />
        </div>
      </Card>

      {/* Kitchen alert */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" /> Alerta de cocina
        </h2>
        <p className="text-sm text-muted-foreground">
          Tiempo en preparación antes de que un pedido parpadee en rojo por demora.
        </p>
        <div className="flex flex-wrap gap-2">
          {([0, 5, 10, 15] as const).map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setForm((f) => ({ ...f, kitchenAlertMinutes: min }))}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold border-2 transition-all ${
                form.kitchenAlertMinutes === min
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {min === 0 ? 'Desactivada' : `${min} min`}
            </button>
          ))}
        </div>
      </Card>

      {/* Payment methods */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Métodos de pago
        </h2>
        <p className="text-sm text-muted-foreground">
          Define los métodos de pago disponibles. Edita el nombre, agrega nuevos o elimina los que no uses.
        </p>
        <div className="space-y-2">
          {form.paymentMethods.map((method, i) => (
            <div key={method.key} className="flex items-center gap-2">
              <Input
                value={method.label}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  paymentMethods: f.paymentMethods.map((m, j) =>
                    j === i ? { ...m, label: e.target.value } : m
                  ),
                }))}
                placeholder="Nombre del método de pago"
              />
              <button
                type="button"
                title={method.isCredit ? 'Método de crédito (sin cobro inmediato)' : 'Marcar como crédito'}
                onClick={() => setForm((f) => ({
                  ...f,
                  paymentMethods: f.paymentMethods.map((m, j) =>
                    j === i ? { ...m, isCredit: !m.isCredit } : m
                  ),
                }))}
                className={`shrink-0 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                  method.isCredit
                    ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                    : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                {method.isCredit ? 'Crédito' : 'Crédito?'}
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({
                  ...f,
                  paymentMethods: f.paymentMethods.filter((_, j) => j !== i),
                }))}
                className="shrink-0 p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({
            ...f,
            paymentMethods: [...f.paymentMethods, { key: `custom_${Date.now()}`, label: '', isCredit: false }],
          }))}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Agregar método de pago
        </button>
        {form.paymentMethods.length === 0 && (
          <p className="text-xs text-destructive">Agrega al menos un método de pago.</p>
        )}
      </Card>

      <Button onClick={handleSave} loading={saving} className="w-full">
        <CheckCircle className="h-4 w-4 mr-2" />
        Guardar configuración
      </Button>
    </div>
  )
}
