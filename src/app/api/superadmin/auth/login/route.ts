import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { publicDb } from '@/lib/db/public-db'
import { superadminUsers, superadminRefreshTokens } from '@/lib/db/schema/public'
import { verifyPassword } from '@/lib/auth/password'
import { signAccessToken, signRefreshToken, REFRESH_TTL_MS } from '@/lib/auth/jwt'
import { setAuthCookies } from '@/lib/auth/cookies'
import { createHash, randomBytes } from 'crypto'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = schema.parse(body)

    const [user] = await publicDb
      .select()
      .from(superadminUsers)
      .where(eq(superadminUsers.email, email.toLowerCase()))
      .limit(1)

    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const accessToken = await signAccessToken({
      type: 'superadmin',
      sub: user.id,
    })

    const rawRefresh = randomBytes(64).toString('hex')
    const refreshToken = await signRefreshToken(user.id, 'superadmin')
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex')

    await publicDb.insert(superadminRefreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })

    setAuthCookies(accessToken, refreshToken, 'superadmin')

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    console.error('Superadmin login error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
