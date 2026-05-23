import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/auth/cookies'
import { headers } from 'next/headers'

export async function POST() {
  const isSuperadmin = headers().get('x-is-superadmin') === 'true'
  clearAuthCookies(isSuperadmin ? 'superadmin' : 'tenant')
  return NextResponse.json({ ok: true })
}
