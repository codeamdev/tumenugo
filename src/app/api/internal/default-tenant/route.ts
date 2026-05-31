import { NextResponse } from 'next/server'
import { getDefaultTenantSlug } from '@/lib/system-config'

export async function GET() {
  const slug = await getDefaultTenantSlug()
  return NextResponse.json({ slug })
}
