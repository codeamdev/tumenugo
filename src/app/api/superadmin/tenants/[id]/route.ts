import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { requireSuperadminSession } from '@/lib/auth/session'
import { invalidateTenantCache } from '@/lib/tenant'

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['active', 'suspended', 'pending']).optional(),
  primaryColor: z.string().optional(),
  plan: z.enum(['basic', 'pro']).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireSuperadminSession()
  const [tenant] = await publicDb
    .select()
    .from(tenants)
    .where(eq(tenants.id, params.id))
    .limit(1)
  if (!tenant) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ data: tenant })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireSuperadminSession()

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const [updated] = await publicDb
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, params.id))
      .returning()

    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    invalidateTenantCache(updated.slug)
    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireSuperadminSession()

  const [tenant] = await publicDb
    .select()
    .from(tenants)
    .where(eq(tenants.id, params.id))
    .limit(1)

  if (!tenant) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Soft delete: suspend instead of hard delete to preserve data
  await publicDb
    .update(tenants)
    .set({ status: 'suspended', updatedAt: new Date() })
    .where(eq(tenants.id, params.id))

  invalidateTenantCache(tenant.slug)
  return NextResponse.json({ ok: true })
}
