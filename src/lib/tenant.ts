import { eq } from 'drizzle-orm'
import { publicDb } from './db/public-db'
import { tenants, type Tenant } from './db/schema/public'
import { headers } from 'next/headers'

// Simple in-process cache to avoid hitting the DB on every server component render.
// TTL: 60 seconds. Adequate for our scale.
const cache = new Map<string, { tenant: Tenant; expiresAt: number }>()
const CACHE_TTL = 60_000

export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const now = Date.now()
  const cached = cache.get(slug)
  if (cached && cached.expiresAt > now) return cached.tenant

  const [tenant] = await publicDb
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) return null
  cache.set(slug, { tenant, expiresAt: now + CACHE_TTL })
  return tenant
}

export function invalidateTenantCache(slug: string): void {
  cache.delete(slug)
}

/**
 * Reads the current tenant from the x-tenant-slug header (set by middleware).
 * Returns null when called from a superadmin context.
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const slug = headers().get('x-tenant-slug')
  if (!slug) return null
  return resolveTenantBySlug(slug)
}

/**
 * Like getCurrentTenant but throws if the tenant is not found or not active.
 */
export async function requireActiveTenant(): Promise<Tenant> {
  const tenant = await getCurrentTenant()
  if (!tenant) throw new Error('Tenant not found')
  if (tenant.status !== 'active') throw new Error('Tenant suspended')
  return tenant
}
