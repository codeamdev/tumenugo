import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant-db'
import { users, refreshTokens } from '@/lib/db/schema/tenant'
import { publicDb } from '@/lib/db/public-db'
import { tenants, userTenantMap } from '@/lib/db/schema/public'
import { verifyPassword } from '@/lib/auth/password'
import { signAccessToken, signRefreshToken, REFRESH_TTL_MS } from '@/lib/auth/jwt'
import { setAuthCookiesOnResponse } from '@/lib/auth/cookies'
import { resolveTenantBySlug } from '@/lib/tenant'
import { getPaymentMethods, DEFAULT_PAYMENT_METHODS } from '@/lib/payment-methods'
import type { PosConfig } from '@/lib/db/schema/public'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import type { Tenant } from '@/lib/db/schema/public'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ─── Tenant resolution ────────────────────────────────────────────────────────

/**
 * Resolves tenant from x-tenant-slug header (web / white-label mobile) OR
 * from the user_tenant_map table using the email (generic mobile login).
 *
 * Returns:
 *   { tenant }             – exactly one tenant found, proceed with auth
 *   { tenants: [...] }    – user belongs to multiple tenants, client must pick
 *   null                  – no tenant found
 */
async function resolveTenant(
  email: string,
  slugHeader: string | null,
): Promise<{ tenant: Tenant } | { tenants: Pick<Tenant, 'id' | 'name' | 'slug'>[] } | null> {
  // ── White-label / web: slug explicit in header ────────────────────────────
  if (slugHeader) {
    const tenant = await resolveTenantBySlug(slugHeader)
    if (!tenant || tenant.status !== 'active') return null
    return { tenant }
  }

  // ── Generic mobile: discover tenant from email via user_tenant_map ────────
  const rows = await publicDb
    .select({ tenantId: userTenantMap.tenantId })
    .from(userTenantMap)
    .where(eq(userTenantMap.email, email))

  if (rows.length === 0) return null

  const tenantIds = rows.map((r) => r.tenantId)

  if (tenantIds.length === 1) {
    const [found] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantIds[0]))
      .limit(1)
    if (!found || found.status !== 'active') return null
    return { tenant: found }
  }

  // Multiple tenants — return the list so the client can show a picker
  const tenantList = await publicDb
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(inArray(tenants.id, tenantIds))
  return { tenants: tenantList }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = schema.parse(body)
    const normalEmail = email.toLowerCase()

    const slugHeader = headers().get('x-tenant-slug')
    const resolution = await resolveTenant(normalEmail, slugHeader)

    if (!resolution) {
      return NextResponse.json({ error: 'Usuario o tenant no encontrado' }, { status: 401 })
    }

    // Client must choose a tenant first
    if ('tenants' in resolution) {
      return NextResponse.json(
        { requiresTenantSelection: true, tenants: resolution.tenants },
        { status: 300 },
      )
    }

    const { tenant } = resolution

    // Look up user in the tenant's schema
    let user: typeof users.$inferSelect | undefined
    await withTenant(tenant.schemaName, async (db) => {
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalEmail))
        .limit(1)
      user = found
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // Issue tokens
    const accessToken = await signAccessToken({
      type: 'tenant',
      sub: user.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schemaName: tenant.schemaName,
      role: user.role,
    })

    const refreshToken = await signRefreshToken(user.id, 'tenant', {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
    })
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)

    await withTenant(tenant.schemaName, async (db) => {
      await db.insert(refreshTokens).values({ userId: user!.id, tokenHash, expiresAt })
    })

    const posConfig = tenant.posConfig as PosConfig | null
    const configured = posConfig?.paymentMethods
    const paymentMethods =
      Array.isArray(configured) && configured.length > 0
        ? getPaymentMethods(posConfig)
        : DEFAULT_PAYMENT_METHODS.filter((m) => ['cash', 'card', 'transfer'].includes(m.key))

    const deliveryFieldsCfg = posConfig?.deliveryFields as Record<string, boolean> | undefined
    const deliveryFields = {
      phone:   deliveryFieldsCfg?.phone   ?? true,
      address: deliveryFieldsCfg?.address ?? true,
      notes:   deliveryFieldsCfg?.notes   ?? true,
      fee:     deliveryFieldsCfg?.fee     ?? true,
    }

    const response = NextResponse.json({
      user:   { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: {
        id: tenant.id, name: tenant.name, slug: tenant.slug,
        primaryColor: tenant.primaryColor ?? '#2563eb',
        currencySign: tenant.currencySign ?? '$',
        logoUrl: tenant.logoUrl ?? null,
      },
      config: {
        paymentMethods,
        deliveryFields,
        defaultOpeningAmount: (posConfig?.defaultOpeningAmount as number | undefined) ?? 0,
      },
      accessToken,
      refreshToken,
    })

    setAuthCookiesOnResponse(response, accessToken, refreshToken, 'tenant')
    return response
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
