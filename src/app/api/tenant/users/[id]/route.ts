import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { users } from '@/lib/db/schema/tenant'
import { publicDb } from '@/lib/db/public-db'
import { userTenantMap } from '@/lib/db/schema/public'
import { hashPassword } from '@/lib/auth/password'

const patchSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['admin', 'cajero', 'mesero', 'cocina']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body   = await request.json()
    const parsed = patchSchema.parse(body)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.name     !== undefined) updateData.name     = parsed.name
    if (parsed.email    !== undefined) updateData.email    = parsed.email.toLowerCase()
    if (parsed.role     !== undefined) updateData.role     = parsed.role
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive
    if (parsed.password)               updateData.passwordHash = await hashPassword(parsed.password)

    // Fetch the old email before updating (needed to fix the map if email changes)
    let oldEmail: string | null = null
    if (parsed.email) {
      const [cur] = await withTenant(tenant.schemaName, async (db) =>
        db.select({ email: users.email }).from(users).where(eq(users.id, params.id)).limit(1)
      )
      oldEmail = cur?.email ?? null
    }

    const [updated] = await withTenant(tenant.schemaName, async (db) =>
      db.update(users)
        .set(updateData)
        .where(eq(users.id, params.id))
        .returning({
          id:       users.id,
          name:     users.name,
          email:    users.email,
          role:     users.role,
          isActive: users.isActive,
        })
    )

    if (!updated) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Keep user_tenant_map in sync when email changes
    if (parsed.email && oldEmail && oldEmail !== updated.email) {
      await publicDb
        .delete(userTenantMap)
        .where(and(eq(userTenantMap.email, oldEmail), eq(userTenantMap.tenantId, tenant.id)))
      await publicDb
        .insert(userTenantMap)
        .values({ email: updated.email, tenantId: tenant.id })
        .onConflictDoNothing()
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  if (session.sub === params.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })
  }
  const tenant = await requireActiveTenant()

  // Fetch email before deletion so we can clean up the map
  const [target] = await withTenant(tenant.schemaName, async (db) =>
    db.select({ email: users.email }).from(users).where(eq(users.id, params.id)).limit(1)
  )

  await withTenant(tenant.schemaName, async (db) =>
    db.delete(users).where(eq(users.id, params.id))
  )

  // Remove email→tenant mapping from public schema
  if (target?.email) {
    await publicDb
      .delete(userTenantMap)
      .where(and(eq(userTenantMap.email, target.email), eq(userTenantMap.tenantId, tenant.id)))
  }

  return NextResponse.json({ ok: true })
}
