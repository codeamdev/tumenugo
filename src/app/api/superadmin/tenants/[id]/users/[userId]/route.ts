import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { withTenant } from '@/lib/db/tenant-db'
import { users } from '@/lib/db/schema/tenant'
import { hashPassword } from '@/lib/auth/password'

const patchSchema = z.object({
  password: z.string().min(6).optional(),
  name:     z.string().min(2).optional(),
  role:     z.enum(['admin', 'cajero', 'mesero', 'cocina']).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  await requireSuperadminSession()

  const [tenant] = await publicDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  try {
    const body = patchSchema.parse(await req.json())
    const update: Record<string, unknown> = {}
    if (body.name)     update.name     = body.name
    if (body.role)     update.role     = body.role
    if (body.isActive !== undefined) update.isActive = body.isActive
    if (body.password) update.passwordHash = await hashPassword(body.password)

    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })

    const [updated] = await withTenant(tenant.schemaName, async (db) =>
      db.update(users)
        .set(update)
        .where(eq(users.id, params.userId))
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
    )

    if (!updated) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  await requireSuperadminSession()

  const [tenant] = await publicDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  await withTenant(tenant.schemaName, async (db) =>
    db.update(users).set({ isActive: false }).where(eq(users.id, params.userId))
  )

  return NextResponse.json({ ok: true })
}
