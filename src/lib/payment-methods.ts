import type { PosConfig } from '@/lib/db/schema/public'

export interface PaymentMethodConfig {
  key: string
  label: string
  isCredit: boolean
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { key: 'cash',      label: 'Efectivo',           isCredit: false },
  { key: 'card',      label: 'Tarjeta',             isCredit: false },
  { key: 'transfer',  label: 'Transferencia',       isCredit: false },
  { key: 'nequi',     label: 'Nequi',               isCredit: false },
  { key: 'daviplata', label: 'Daviplata',           isCredit: false },
  { key: 'other',     label: 'Otro',                isCredit: false },
  { key: 'fiado',     label: 'Pendiente por pagar', isCredit: true  },
]

export function toDbMethod(key: string): string {
  return key || 'other'
}

export function getPaymentMethods(posConfig: PosConfig | null | undefined): PaymentMethodConfig[] {
  const raw = posConfig?.paymentMethods
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PAYMENT_METHODS
  return raw.map((m) => ({
    key: m.key,
    label: m.label,
    // backward compat: if isCredit not stored yet, infer from key name
    isCredit: m.isCredit ?? (m.key === 'fiado'),
  }))
}

export function buildMethodLabels(posConfig: PosConfig | null | undefined): Record<string, string> {
  const base = Object.fromEntries(DEFAULT_PAYMENT_METHODS.map((m) => [m.key, m.label]))
  const methods = getPaymentMethods(posConfig)
  for (const m of methods) base[m.key] = m.label
  // 'fiado' is the DB bucket for all credit methods — map it to the tenant's credit label
  const creditMethod = methods.find((m) => m.isCredit)
  if (creditMethod) base['fiado'] = creditMethod.label
  return base
}

export function getCreditMethodKeys(posConfig: PosConfig | null | undefined): Set<string> {
  return new Set(getPaymentMethods(posConfig).filter((m) => m.isCredit).map((m) => m.key))
}
