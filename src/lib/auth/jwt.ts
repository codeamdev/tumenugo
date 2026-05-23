import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const ACCESS_TTL = 15 * 60 // 15 minutes
const REFRESH_TTL = 7 * 24 * 60 * 60 // 7 days

function getSecret(key: string): Uint8Array {
  const secret = process.env[key]
  if (!secret) throw new Error(`Missing env var: ${key}`)
  return new TextEncoder().encode(secret)
}

// ─── Payload types ────────────────────────────────────────────────────────────

export interface SuperadminAccessPayload extends JWTPayload {
  type: 'superadmin'
  sub: string // superadmin user id
}

export interface TenantAccessPayload extends JWTPayload {
  type: 'tenant'
  sub: string // user id
  tenantId: string
  tenantSlug: string
  schemaName: string
  role: string
}

export type AccessPayload = SuperadminAccessPayload | TenantAccessPayload

// ─── Sign ─────────────────────────────────────────────────────────────────────

export async function signAccessToken(
  payload: Omit<AccessPayload, 'iat' | 'exp'>
): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(getSecret('JWT_SECRET'))
}

export interface RefreshPayload {
  sub: string
  type: 'superadmin' | 'tenant'
  kind: 'refresh'
  tenantId?: string
  tenantSlug?: string
  schemaName?: string
}

export async function signRefreshToken(
  sub: string,
  type: 'superadmin' | 'tenant',
  tenant?: { id: string; slug: string; schemaName: string },
): Promise<string> {
  const extra = tenant ? { tenantId: tenant.id, tenantSlug: tenant.slug, schemaName: tenant.schemaName } : {}
  return new SignJWT({ sub, type, kind: 'refresh', ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL}s`)
    .sign(getSecret('JWT_REFRESH_SECRET'))
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_SECRET'))
  return payload as AccessPayload
}

export async function verifyRefreshToken(token: string): Promise<RefreshPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_REFRESH_SECRET'))
  return payload as unknown as RefreshPayload
}

export const REFRESH_TTL_MS = REFRESH_TTL * 1000
export const ACCESS_TTL_MS = ACCESS_TTL * 1000
