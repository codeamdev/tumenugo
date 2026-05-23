import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { categories } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().default(0),
  color: z.string().optional(),
  emoji: z.string().optional(),
})

export async function GET() {
  const session = await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder))
  )

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenant = await requireActiveTenant()

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const [created] = await withTenant(tenant.schemaName, async (db) =>
      db.insert(categories).values(data).returning()
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
