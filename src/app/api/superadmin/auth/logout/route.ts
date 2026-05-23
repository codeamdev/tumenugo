import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/auth/cookies'

export async function POST() {
  clearAuthCookies('superadmin')
  return NextResponse.json({ ok: true })
}
