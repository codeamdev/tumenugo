import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc, and } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { products, modifierGroups, modifiers } from '@/lib/db/schema/tenant'

const createSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  sku: z.string().optional(),
  taxRateId: z.string().uuid().optional(),
  prepTimeMin: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export async function GET(request: NextRequest) {
  const session = await requireTenantSession()
  const tenant = await requireActiveTenant()
  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('categoryId')
  // admin/cajero can request all products (including unavailable) for management screens
  const showAll = searchParams.get('showAll') === 'true' && ['admin', 'cajero'].includes(session.role)

  const data = await withTenant(tenant.schemaName, async (db) => {
    const prods = await db
      .select()
      .from(products)
      .where(
        and(
          ...(showAll ? [] : [eq(products.isAvailable, true)]),
          ...(categoryId ? [eq(products.categoryId, categoryId)] : [])
        )
      )
      .orderBy(asc(products.sortOrder), asc(products.name))

    // Fetch modifier groups for each product
    const prodIds = prods.map((p) => p.id)
    if (prodIds.length === 0) return prods.map((p) => ({ ...p, modifierGroups: [] }))

    const groups = await db
      .select()
      .from(modifierGroups)
      .orderBy(asc(modifierGroups.sortOrder))

    const mods = await db
      .select()
      .from(modifiers)
      .orderBy(asc(modifiers.sortOrder))

    return prods.map((p) => {
      const pGroups = groups.filter((g) => g.productId === p.id).map((g) => ({
        ...g,
        modifiers: mods.filter((m) => m.groupId === g.id),
      }))
      return { ...p, modifierGroups: pGroups }
    })
  })

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const [created] = await withTenant(tenant.schemaName, async (db) =>
      db.insert(products).values(data).returning()
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
