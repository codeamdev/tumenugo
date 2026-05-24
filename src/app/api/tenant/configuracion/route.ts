import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant, invalidateTenantCache } from '@/lib/tenant'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'

const deliveryFieldsSchema = z.object({
  phone: z.boolean(),
  address: z.boolean(),
  notes: z.boolean(),
  fee: z.boolean(),
})

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  timezone: z.string().optional(),
  currencySign: z.string().max(5).optional(),
  taxConfig: z.object({
    defaultRate: z.number().min(0).max(100),
    includesIVA: z.boolean(),
    includesINC: z.boolean(),
  }).optional(),
  posConfig: z.object({
    deliveryFields: deliveryFieldsSchema,
    paymentMethods: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), isCredit: z.boolean().optional() })).optional(),
    defaultOpeningAmount: z.number().min(0).optional(),
    defaultDeliveryFee: z.number().min(0).optional(),
  }).optional(),
})

export async function GET(_: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const tenant = await requireActiveTenant()
  return NextResponse.json({ data: tenant })
}

export async function PATCH(req: NextRequest) {
  const session = await requireTenantSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const tenant = await requireActiveTenant()

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const { taxConfig: _tc, posConfig, ...rest } = data
    const [updated] = await publicDb
      .update(tenants)
      .set({ ...rest, ...(posConfig !== undefined ? { posConfig } : {}), updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
      .returning()

    invalidateTenantCache(tenant.slug)

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
