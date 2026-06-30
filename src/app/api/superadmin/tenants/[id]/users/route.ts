import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireSuperadminSession } from '@/lib/auth/session'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { withTenant } from '@/lib/db/tenant-db'
import { users } from '@/lib/db/schema/tenant'
import { hashPassword } from '@/lib/auth/password'

const createUserSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  role:     z.enum(['admin', 'cajero', 'mesero', 'cocina']),
  password: z.string().min(8),
})

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperadminSession()
  const [tenant] = await publicDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const data = await withTenant(tenant.schemaName, async (db) => {
    return db.select({
      id: users.id, name: users.name, email: users.email,
      role: users.role, isActive: users.isActive, createdAt: users.createdAt,
    }).from(users).orderBy(users.createdAt)
  })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await requireSuperadminSession()
  const [tenant] = await publicDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  try {
    const body = createUserSchema.parse(await req.json())
    const passwordHash = await hashPassword(body.password)

    const [user] = await withTenant(tenant.schemaName, async (db) => {
      return db.insert(users).values({
        name: body.name, email: body.email.toLowerCase(),
        passwordHash, role: body.role, isActive: true,
      }).returning({ id: users.id, name: users.name, email: users.email, role: users.role })
    })

    return NextResponse.json({ data: user }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    const msg = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
