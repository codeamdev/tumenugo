import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { modifierGroups, modifiers } from '@/lib/db/schema/tenant'

const groupSchema = z.object({
  name: z.string().min(1),
  selectionType: z.enum(['single', 'multiple']).default('single'),
  isRequired: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().optional(),
  sortOrder: z.number().int().default(0),
  modifiers: z.array(
    z.object({
      name: z.string().min(1),
      priceDelta: z.string().default('0'),
      isDefault: z.boolean().default(false),
      sortOrder: z.number().int().default(0),
    })
  ),
})

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) => {
    const groups = await db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.productId, params.id))
      .orderBy(asc(modifierGroups.sortOrder))

    const mods = await db
      .select()
      .from(modifiers)
      .orderBy(asc(modifiers.sortOrder))

    return groups.map((g) => ({
      ...g,
      modifiers: mods.filter((m) => m.groupId === g.id),
    }))
  })

  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  try {
    const body = await req.json()
    const groups = z.array(groupSchema).parse(body)

    await withTenant(tenant.schemaName, async (db) => {
      // Delete existing modifier groups (cascades to modifiers)
      await db.delete(modifierGroups).where(eq(modifierGroups.productId, params.id))

      for (const group of groups) {
        const [created] = await db
          .insert(modifierGroups)
          .values({
            productId: params.id,
            name: group.name,
            selectionType: group.selectionType,
            isRequired: group.isRequired,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder,
          })
          .returning()

        if (group.modifiers.length > 0) {
          await db.insert(modifiers).values(
            group.modifiers.map((m) => ({ ...m, groupId: created.id }))
          )
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
