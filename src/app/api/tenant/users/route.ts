import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { users } from '@/lib/db/schema/tenant'
import { publicDb } from '@/lib/db/public-db'
import { userTenantMap } from '@/lib/db/schema/public'
import { hashPassword } from '@/lib/auth/password'

const createSchema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email(),
  password: z.string().min(6),
  role:     z.enum(['admin', 'cajero', 'mesero', 'cocina']),
})

export async function GET() {
  const session = await requireTenantSession()
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) =>
    db.select({
      id:        users.id,
      name:      users.name,
      email:     users.email,
      role:      users.role,
      isActive:  users.isActive,
      createdAt: users.createdAt,
    }).from(users).orderBy(asc(users.name))
  )

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body   = await request.json()
    const parsed = createSchema.parse(body)
    const normalEmail  = parsed.email.toLowerCase()
    const passwordHash = await hashPassword(parsed.password)

    const [created] = await withTenant(tenant.schemaName, async (db) =>
      db.insert(users).values({
        name:  parsed.name,
        email: normalEmail,
        passwordHash,
        role:  parsed.role,
      }).returning({
        id:       users.id,
        name:     users.name,
        email:    users.email,
        role:     users.role,
        isActive: users.isActive,
      })
    )

    // Register email→tenant mapping in public schema
    await publicDb
      .insert(userTenantMap)
      .values({ email: normalEmail, tenantId: tenant.id })
      .onConflictDoNothing()

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
