import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveTenantBySlug } from '@/lib/tenant'
import { LoginForm } from './login-form'
import { Store } from 'lucide-react'

export default async function TenantLoginPage() {
  const slug = headers().get('x-tenant-slug')
  if (!slug) redirect('/')

  const tenant = await resolveTenantBySlug(slug)

  if (!tenant || tenant.status !== 'active') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Store className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Negocio no encontrado</h1>
          <p className="text-muted-foreground">
            No existe ningún establecimiento registrado en{' '}
            <span className="font-mono font-medium">{slug}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifica que la dirección sea correcta o contacta al administrador.
          </p>
        </div>
      </div>
    )
  }

  return (
    <LoginForm
      tenantName={tenant.name}
      primaryColor={tenant.primaryColor}
    />
  )
}
