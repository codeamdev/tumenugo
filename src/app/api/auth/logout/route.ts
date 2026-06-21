import { NextRequest, NextResponse } from 'next/server'
import { eq, and, isNull } from 'drizzle-orm'
import { createHash } from 'crypto'
import { clearAuthCookies, getRefreshToken, REFRESH_COOKIE } from '@/lib/auth/cookies'
import { verifyRefreshToken } from '@/lib/auth/jwt'
import { withTenant } from '@/lib/db/tenant-db'
import { refreshTokens } from '@/lib/db/schema/tenant'
import { headers } from 'next/headers'

export async function POST(request: NextRequest) {
  const isSuperadmin = headers().get('x-is-superadmin') === 'true'

  // Resolve the refresh token: mobile sends Bearer, web has it in cookie
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const cookieToken = !isSuperadmin ? getRefreshToken('tenant') : undefined
  const refreshToken = bearerToken ?? cookieToken ?? null

  clearAuthCookies(isSuperadmin ? 'superadmin' : 'tenant')

  // Revoke in DB (best-effort: clear local session regardless of outcome)
  if (refreshToken && !isSuperadmin) {
    try {
      const payload = await verifyRefreshToken(refreshToken)
      if (payload.kind === 'refresh' && payload.type === 'tenant' && payload.schemaName) {
        const tokenHash = createHash('sha256').update(refreshToken).digest('hex')
        await withTenant(payload.schemaName, async (db) => {
          await db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        })
      }
    } catch {
      // Expired or malformed token — no DB action needed
    }
  }

  return NextResponse.json({ ok: true })
}
