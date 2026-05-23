import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { publicDb } from '@/lib/db/public-db'
import { tenants } from '@/lib/db/schema/public'
import { requireSuperadminSession } from '@/lib/auth/session'
import { provisionTenant } from '@/lib/provisioning'

const createSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z][a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  businessType: z.enum(['cafeteria', 'restaurant', 'fast_food']),
  adminEmail: z.string().email(),
  adminName: z.string().min(2),
  adminPassword: z.string().min(8),
  timezone: z.string().default('America/Bogota'),
  primaryColor: z.string().optional(),
})

export async function GET() {
  await requireSuperadminSession()

  const all = await publicDb
    .select()
    .from(tenants)
    .orderBy(desc(tenants.createdAt))

  return NextResponse.json({ data: all })
}

export async function POST(request: NextRequest) {
  await requireSuperadminSession()

  try {
    const body = await request.json()
    const data = createSchema.parse(body)
    const tenant = await provisionTenant(data)
    return NextResponse.json({ data: tenant }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
