import { publicDb } from './db/public-db'
import { systemConfig } from './db/schema/public'
import { eq } from 'drizzle-orm'

let _cachedSlug: string | null = null
let _cacheExpiry = 0

export async function getDefaultTenantSlug(): Promise<string> {
  if (Date.now() < _cacheExpiry && _cachedSlug !== null) return _cachedSlug
  try {
    const [row] = await publicDb.select().from(systemConfig).limit(1)
    _cachedSlug = row?.defaultTenantSlug ?? ''
    _cacheExpiry = Date.now() + 60_000
  } catch {
    _cachedSlug ??= ''
  }
  return _cachedSlug
}

export async function setDefaultTenantSlug(slug: string): Promise<void> {
  await publicDb
    .update(systemConfig)
    .set({ defaultTenantSlug: slug, updatedAt: new Date() })
    .where(eq(systemConfig.id, 1))
  _cachedSlug = slug
  _cacheExpiry = Date.now() + 60_000
}
