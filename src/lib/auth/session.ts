import { headers } from 'next/headers'
import { verifyAccessToken, type AccessPayload, type TenantAccessPayload, type SuperadminAccessPayload } from './jwt'
import { getAccessToken } from './cookies'
import { redirect } from 'next/navigation'

export async function getSession(): Promise<AccessPayload | null> {
  // Determine type from context: if x-is-superadmin header is present, check SA token
  const headerStore = headers()
  const isSuperadmin = headerStore.get('x-is-superadmin') === 'true'
  const type = isSuperadmin ? 'superadmin' : 'tenant'

  // Cookie-based auth (web) with Bearer token fallback (mobile clients)
  let token = getAccessToken(type)
  if (!token) {
    const authHeader = headerStore.get('authorization')
    if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7)
  }
  if (!token) return null

  try {
    return await verifyAccessToken(token)
  } catch {
    return null
  }
}

export async function requireSuperadminSession(): Promise<SuperadminAccessPayload> {
  const session = await getSession()
  if (!session || session.type !== 'superadmin') {
    redirect('/superadmin/login')
  }
  return session
}

export async function requireTenantSession(
  expectedSlug?: string
): Promise<TenantAccessPayload> {
  const headerStore = headers()
  const tenantSlug = headerStore.get('x-tenant-slug')

  // Use getSession() so Bearer token (mobile) works alongside cookie auth (web)
  const session = await getSession()
  if (!session || session.type !== 'tenant') redirect('/login')

  if (tenantSlug && session.tenantSlug !== tenantSlug) redirect('/login')
  if (expectedSlug && session.tenantSlug !== expectedSlug) redirect('/login')

  return session as TenantAccessPayload
}
