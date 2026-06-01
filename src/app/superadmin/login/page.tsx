import { redirect } from 'next/navigation'
import { getAccessToken } from '@/lib/auth/cookies'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { LoginForm } from './login-form'

export default async function SuperadminLoginPage() {
  // Si ya hay sesión válida, redirigir directamente al panel
  const token = getAccessToken('superadmin')
  if (token) {
    try {
      const payload = await verifyAccessToken(token)
      if (payload.type === 'superadmin') redirect('/superadmin/tenants')
    } catch {}
  }

  return <LoginForm />
}
