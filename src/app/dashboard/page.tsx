import { requireTenantSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await requireTenantSession()

  if (session.role === 'mesero') redirect('/pedidos')
  if (session.role === 'cocina') redirect('/cocina')
  redirect('/informes')
}
