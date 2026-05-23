export type UserRole = 'admin' | 'cajero' | 'mesero' | 'cocina'
export type BusinessType = 'cafeteria' | 'restaurant' | 'fast_food'
export type TenantStatus = 'active' | 'suspended' | 'pending'
export type OrderType = 'table' | 'bar' | 'delivery'
export type OrderStatus =
  | 'new'
  | 'sent'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'closed'
  | 'cancelled'
export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'nequi'
  | 'daviplata'
  | 'other'
  | 'fiado'

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  cafeteria: 'Cafetería',
  restaurant: 'Restaurante',
  fast_food: 'Comidas Rápidas',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Nuevo',
  sent: 'Enviado a cocina',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Anulado',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  other: 'Otro',
  fiado: 'Pendiente por pagar',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
}
