import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { UsuariosClient } from './usuarios-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Usuarios' }

export default async function UsuariosPage() {
  const session = await requireTenantSession()
  if (session.role !== 'admin') redirect('/dashboard')

  await requireActiveTenant()

  return <UsuariosClient currentUserId={session.sub} />
}
