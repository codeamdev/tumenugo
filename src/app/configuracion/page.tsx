'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'
import { Settings, Palette, Globe, DollarSign, CheckCircle, Truck, CreditCard, LockOpen, Plus, Trash2 } from 'lucide-react'

interface PaymentMethodConfig {
  key: string
  label: string
  isCredit: boolean
}

interface TenantConfig {
  id: string
  name: string
  primaryColor: string | null
  timezone: string | null
  currencySign: string | null
  taxConfig: { defaultRate: number; includesIVA: boolean; includesINC: boolean } | null
  posConfig: {
    deliveryFields: { phone: boolean; address: boolean; notes: boolean; fee: boolean }
    paymentMethods?: { key: string; label: string; isCredit?: boolean }[] | string[]
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

const TIMEZONES = [
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Caracas',
]

const PRESET_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#be185d', '#d97706',
]

export default function ConfiguracionPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [form, setForm] = useState({
    name: '',
    primaryColor: '#2563eb',
    timezone: 'America/Bogota',
    currencySign: '$',
    taxDefaultRate: 19,
    includesIVA: true,
    includesINC: false,
    deliveryPhone: true,
    deliveryAddress: true,
    deliveryNotes: true,
    deliveryFee: true,
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    defaultOpeningAmount: 0,
  })

  useEffect(() => {
    fetch('/api/tenant/configuracion')
      .then((r) => r.json())
      .then((json) => {
        const d = json.data
        setConfig(d)
        setForm({
          name: d.name ?? '',
          primaryColor: d.primaryColor ?? '#2563eb',
          timezone: d.timezone ?? 'America/Bogota',
          currencySign: d.currencySign ?? '$',
          taxDefaultRate: d.taxConfig?.defaultRate ?? 19,
          includesIVA: d.taxConfig?.includesIVA ?? true,
          includesINC: d.taxConfig?.includesINC ?? false,
          deliveryPhone: d.posConfig?.deliveryFields?.phone ?? true,
          deliveryAddress: d.posConfig?.deliveryFields?.address ?? true,
          deliveryNotes: d.posConfig?.deliveryFields?.notes ?? true,
          deliveryFee: d.posConfig?.deliveryFields?.fee ?? true,
          paymentMethods: normalizePaymentMethods(d.posConfig?.paymentMethods),
          defaultOpeningAmount: d.posConfig?.defaultOpeningAmount ?? 0,
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
          name: form.name,
          primaryColor: form.primaryColor,
          timezone: form.timezone,
          currencySign: form.currencySign,
          taxConfig: {
            defaultRate: form.taxDefaultRate,
            includesIVA: form.includesIVA,
            includesINC: form.includesINC,
          },
          posConfig: {
            deliveryFields: {
              phone: form.deliveryPhone,
              address: form.deliveryAddress,
              notes: form.deliveryNotes,
              fee: form.deliveryFee,
            },
            paymentMethods: form.paymentMethods,
            defaultOpeningAmount: form.defaultOpeningAmount,
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

      {/* General */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4" /> General
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nombre del negocio</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Mi Cafetería"
            />
          </div>
          <div className="space-y-2">
            <Label>Zona horaria</Label>
            <select
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Branding */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4" /> Marca y color
        </h2>
        <div className="space-y-3">
          <Label>Color principal</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setForm((f) => ({ ...f, primaryColor: color }))}
                className="h-8 w-8 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: color,
                  borderColor: form.primaryColor === color ? '#000' : 'transparent',
                  transform: form.primaryColor === color ? 'scale(1.15)' : 'scale(1)',
                }}
                aria-label={color}
              />
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                className="h-8 w-8 rounded cursor-pointer border"
                title="Color personalizado"
              />
              <span className="text-sm text-muted-foreground font-mono">{form.primaryColor}</span>
            </div>
          </div>
          <div
            className="h-2 rounded-full transition-colors"
            style={{ backgroundColor: form.primaryColor }}
          />
        </div>
      </Card>

      {/* Currency & Taxes */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Moneda e impuestos
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Signo de moneda</Label>
            <Input
              value={form.currencySign}
              onChange={(e) => setForm((f) => ({ ...f, currencySign: e.target.value }))}
              maxLength={5}
              placeholder="$"
            />
          </div>
          <div className="space-y-2">
            <Label>Tasa de impuesto por defecto (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.taxDefaultRate}
              onChange={(e) => setForm((f) => ({ ...f, taxDefaultRate: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.includesIVA}
              onChange={(e) => setForm((f) => ({ ...f, includesIVA: e.target.checked }))}
              className="rounded"
            />
            IVA (19%)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.includesINC}
              onChange={(e) => setForm((f) => ({ ...f, includesINC: e.target.checked }))}
              className="rounded"
            />
            INC (8%)
          </label>
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
