import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants, systemConfig } from '@/lib/db/schema/public'
import { setDefaultTenantSlug, getDefaultTenantSlug } from '@/lib/system-config'

export async function GET() {
  await requireSuperadminSession()

  const [defaultSlug, activeTenants] = await Promise.all([
    getDefaultTenantSlug(),
    publicDb
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.status, 'active'))
      .orderBy(tenants.name),
  ])

  return NextResponse.json({ data: { defaultTenantSlug: defaultSlug, tenants: activeTenants } })
}

const patchSchema = z.object({
  defaultTenantSlug: z.string().max(63),
})

export async function PATCH(request: NextRequest) {
  await requireSuperadminSession()

  try {
    const body = await request.json()
    const { defaultTenantSlug } = patchSchema.parse(body)
    await setDefaultTenantSlug(defaultTenantSlug)
    return NextResponse.json({ data: { defaultTenantSlug } })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
