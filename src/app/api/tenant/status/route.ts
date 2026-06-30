import { NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/tenant'

// Endpoint público (sin auth) para que el mobile pueda verificar si el tenant está suspendido.
// No expone datos sensibles — solo el estado operativo.
export async function GET() {
  const tenant = await getCurrentTenant()
  if (!tenant) return NextResponse.json({ status: 'not_found' }, { status: 404 })

  return NextResponse.json({
    status: tenant.status,
    name: tenant.name,
    suspended: tenant.status === 'suspended',
  })
}
