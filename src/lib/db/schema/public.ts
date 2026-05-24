import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core'

export const businessTypeEnum = pgEnum('business_type', [
  'cafeteria',
  'restaurant',
  'fast_food',
])
export const planEnum = pgEnum('plan', ['basic', 'pro'])
export const tenantStatusEnum = pgEnum('tenant_status', [
  'active',
  'suspended',
  'pending',
])

export interface PosConfig {
  deliveryFields: {
    phone: boolean
    address: boolean
    notes: boolean
    fee: boolean
  }
  paymentMethods?: { key: string; label: string; isCredit?: boolean }[]
  defaultOpeningAmount?: number
  defaultDeliveryFee?: number
}

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  schemaName: text('schema_name').notNull().unique(),
  businessType: businessTypeEnum('business_type').notNull(),
  plan: planEnum('plan').notNull().default('basic'),
  status: tenantStatusEnum('status').notNull().default('pending'),
  timezone: text('timezone').notNull().default('America/Bogota'),
  currencySign: text('currency_sign').notNull().default('$'),
  taxConfig: jsonb('tax_config').$type<TaxConfigEntry[]>(),
  posConfig: jsonb('pos_config').$type<PosConfig>(),
  primaryColor: text('primary_color').default('#2563eb'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const superadminUsers = pgTable('superadmin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const superadminRefreshTokens = pgTable('superadmin_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => superadminUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * Maps each user email to the tenant they belong to.
 * Maintained automatically when users are created / deleted / email-updated.
 * Enables email-based tenant discovery for mobile clients that don't send x-tenant-slug.
 */
export const userTenantMap = pgTable(
  'user_tenant_map',
  {
    id:       uuid('id').primaryKey().defaultRandom(),
    email:    text('email').notNull(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    emailTenantUnique: unique('user_tenant_map_email_tenant_unique').on(t.email, t.tenantId),
    emailIdx: index('idx_user_tenant_map_email').on(t.email),
  }),
)

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert
export type SuperadminUser = typeof superadminUsers.$inferSelect
export type UserTenantMap = typeof userTenantMap.$inferSelect

export interface TaxConfigEntry {
  name: string
  type: 'IVA' | 'INC' | 'none'
  rate: number
  isDefault: boolean
}
