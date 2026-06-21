import { NextRequest, NextResponse } from 'next/server'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { createHash } from 'crypto'
import { verifyRefreshToken, signAccessToken, signRefreshToken, REFRESH_TTL_MS } from '@/lib/auth/jwt'
import { withTenant } from '@/lib/db/tenant-db'
import { users, refreshTokens } from '@/lib/db/schema/tenant'
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

    const incomingHash = createHash('sha256').update(token).digest('hex')

    // Verify tenant is still active
    const [tenant] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!tenant || tenant.status !== 'active') {
      return NextResponse.json({ error: 'Tenant inactivo' }, { status: 401 })
    }

    let user: typeof users.$inferSelect | undefined
    let newAccessToken: string
    let newRefreshToken: string

    await withTenant(schemaName, async (db) => {
      // 1. Validate token in DB: must exist, not revoked, not expired
      const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, incomingHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date()),
          ),
        )
        .limit(1)

      if (!tokenRecord) {
        // Token not in DB, already revoked, or expired → possible reuse attack
        throw new Error('REVOKED')
      }

      // 2. Re-fetch user to get current role and active status
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!found || !found.isActive) {
        throw new Error('INACTIVE_USER')
      }
      user = found

      newAccessToken = await signAccessToken({
        type: 'tenant',
        sub: user.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.schemaName,
        role: user.role,
      })

      newRefreshToken = await signRefreshToken(user.id, 'tenant', {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schemaName,
      })

      const newHash = createHash('sha256').update(newRefreshToken).digest('hex')
      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)

      // 3. Rotate: revoke old token and insert new one atomically
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, tokenRecord.id))

      await db
        .insert(refreshTokens)
        .values({ userId: user.id, tokenHash: newHash, expiresAt })
    })

    return NextResponse.json({
      accessToken: newAccessToken!,
      refreshToken: newRefreshToken!,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'REVOKED') {
      return NextResponse.json({ error: 'Token revocado o ya usado' }, { status: 401 })
    }
    if (msg === 'INACTIVE_USER') {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }
}
