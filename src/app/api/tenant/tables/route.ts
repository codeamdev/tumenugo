import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { tables } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  name: z.string().min(1).max(50),
  capacity: z.number().int().min(1).default(4),
  zone: z.string().default('Salón'),
  posX: z.number().default(0),
  posY: z.number().default(0),
})

export async function GET() {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(tables).where(eq(tables.isActive, true)).orderBy(asc(tables.name))
  )

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const tenant = await requireActiveTenant()

  try {
    const data = createSchema.parse(await request.json())
    const [created] = await withTenant(tenant.schemaName, async (db) =>
      db.insert(tables).values(data).returning()
    )
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
