import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
  numeric,
  pgEnum,
  real,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'cajero',
  'mesero',
  'cocina',
])

export const tableStatusEnum = pgEnum('table_status', [
  'available',
  'occupied',
  'reserved',
  'cleaning',
])

export const selectionTypeEnum = pgEnum('selection_type', ['single', 'multiple'])

export const orderTypeEnum = pgEnum('order_type', ['table', 'bar', 'delivery'])

export const orderStatusEnum = pgEnum('order_status', [
  'new',
  'sent',
  'preparing',
  'ready',
  'delivered',
  'closed',
  'cancelled',
])

export const itemStatusEnum = pgEnum('item_status', [
  'pending',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
])

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid'])

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'card',
  'transfer',
  'nequi',
  'daviplata',
  'other',
  'fiado',
])

export const registerStatusEnum = pgEnum('register_status', ['open', 'closed'])

export const taxTypeEnum = pgEnum('tax_type', ['IVA', 'INC', 'none'])

export const discountTypeEnum = pgEnum('discount_type', ['percentage', 'fixed'])

export const entryTypeEnum = pgEnum('entry_type', [
  'sale',
  'refund',
  'adjustment',
  'tip',
])

// ─── Users & Auth ─────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull().default('mesero'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  payload: jsonb('payload'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── Tables / Mesas ───────────────────────────────────────────────────────────

export const tables = pgTable('tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(4),
  zone: text('zone').notNull().default('Salón'),
  status: tableStatusEnum('status').notNull().default('available'),
  posX: real('pos_x').default(0),
  posY: real('pos_y').default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  color: text('color').default('#6b7280'),
  emoji: text('emoji'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const taxRates = pgTable('tax_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: taxTypeEnum('type').notNull(),
  rate: numeric('rate', { precision: 5, scale: 2 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  sku: text('sku'),
  taxRateId: uuid('tax_rate_id'),
  prepTimeMin: integer('prep_time_min').default(0),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const modifierGroups = pgTable('modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull(),
  name: text('name').notNull(),
  selectionType: selectionTypeEnum('selection_type').notNull().default('single'),
  isRequired: boolean('is_required').notNull().default(false),
  minSelections: integer('min_selections').notNull().default(0),
  maxSelections: integer('max_selections'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const modifiers = pgTable('modifiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull(),
  name: text('name').notNull(),
  priceDelta: numeric('price_delta', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const combos = pgTable('combos', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const comboItems = pgTable('combo_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  comboId: uuid('combo_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull().default(1),
})

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  discountType: discountTypeEnum('discount_type').notNull(),
  discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull(),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── Orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  localId: uuid('local_id').unique(),
  displayCode: text('display_code'),
  type: orderTypeEnum('type').notNull(),
  tableId: uuid('table_id'),
  status: orderStatusEnum('status').notNull().default('new'),
  // Delivery fields
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerAddress: text('customer_address'),
  customerNotes: text('customer_notes'),
  deliveryFee: numeric('delivery_fee', { precision: 12, scale: 2 }).default('0'),
  // Totals (snapshot on close)
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  couponId: uuid('coupon_id'),
  taxBreakdown: jsonb('tax_breakdown').$type<TaxBreakdownEntry[]>(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  tipAmount: numeric('tip_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  // Payment
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  paymentMethod: paymentMethodEnum('payment_method'),
  cashReceived: numeric('cash_received', { precision: 12, scale: 2 }),
  changeGiven: numeric('change_given', { precision: 12, scale: 2 }),
  paymentNotes: text('payment_notes'),
  // Meta
  notes: text('notes'),
  servedBy: uuid('served_by'),
  closedBy: uuid('closed_by'),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  productId: uuid('product_id'),
  productSnapshot: jsonb('product_snapshot')
    .notNull()
    .$type<ProductSnapshot>(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  modifierSnapshot: jsonb('modifier_snapshot').$type<ModifierSnapshot[]>(),
  modifiersTotal: numeric('modifiers_total', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  itemTotal: numeric('item_total', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  status: itemStatusEnum('status').notNull().default('pending'),
})

// ─── Cash Register / Caja ─────────────────────────────────────────────────────

export const cashRegisters = pgTable('cash_registers', {
  id: uuid('id').primaryKey().defaultRandom(),
  openedBy: uuid('opened_by').notNull(),
  closedBy: uuid('closed_by'),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openingAmount: numeric('opening_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  expectedCash: numeric('expected_cash', { precision: 12, scale: 2 }),
  countedCash: numeric('counted_cash', { precision: 12, scale: 2 }),
  difference: numeric('difference', { precision: 12, scale: 2 }),
  notes: text('notes'),
  status: registerStatusEnum('status').notNull().default('open'),
})

export const cashRegisterEntries = pgTable('cash_register_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  registerId: uuid('register_id').notNull(),
  orderId: uuid('order_id'),
  type: entryTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
export type Table = typeof tables.$inferSelect
export type Category = typeof categories.$inferSelect
export type TaxRate = typeof taxRates.$inferSelect
export type Product = typeof products.$inferSelect
export type ModifierGroup = typeof modifierGroups.$inferSelect
export type Modifier = typeof modifiers.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderItem = typeof orderItems.$inferSelect
export type CashRegister = typeof cashRegisters.$inferSelect

export interface TaxBreakdownEntry {
  name: string
  rate: number
  amount: number
}

export interface ProductSnapshot {
  name: string
  price: string
  sku?: string | null
  taxRateId?: string | null
  taxRate?: number | null
  taxName?: string | null
}

export interface ModifierSnapshot {
  groupName: string
  modifierName: string
  priceDelta: string
}
