import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { withTenant } from '@/lib/db/tenant-db'
import { users } from '@/lib/db/schema/tenant'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  try {
    const payload = await verifyRefreshToken(token)

    if (payload.kind !== 'refresh' || payload.type !== 'tenant') {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { sub: userId, tenantId, tenantSlug, schemaName } = payload

    if (!tenantId || !tenantSlug || !schemaName) {
      return NextResponse.json({ error: 'Token sin contexto de tenant' }, { status: 401 })
    }

    // Verify tenant is still active
    const [tenant] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!tenant || tenant.status !== 'active') {
      return NextResponse.json({ error: 'Tenant inactivo' }, { status: 401 })
    }

    // Re-fetch user to get current role and active status
    let user: typeof users.$inferSelect | undefined
    await withTenant(schemaName, async (db) => {
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      user = found
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 401 })
    }

    const newAccessToken = await signAccessToken({
      type: 'tenant',
      sub: user.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schemaName: tenant.schemaName,
      role: user.role,
    })

    const newRefreshToken = await signRefreshToken(user.id, 'tenant', {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
    })

    return NextResponse.json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
  } catch {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }
}
