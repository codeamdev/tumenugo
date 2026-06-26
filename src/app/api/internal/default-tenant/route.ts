import { NextResponse } from 'next/server'
import { getDefaultTenantSlug } from '@/lib/system-config'
import { requireSuperadminSession } from '@/lib/auth/session'

export async function GET() {
  await requireSuperadminSession()
  const slug = await getDefaultTenantSlug()
  return NextResponse.json({ slug })
}
