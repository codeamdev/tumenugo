import { NextRequest, NextResponse } from 'next/server'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'localhost'

// Module-level cache para el tenant por defecto (TTL 60s).
// Se sincroniza desde /api/internal/default-tenant; cae en cascada al env var.
let _cachedDefaultSlug: string | null = null
let _cacheExpiry = 0

async function resolveDefaultTenantSlug(origin: string): Promise<string> {
  if (Date.now() < _cacheExpiry && _cachedDefaultSlug !== null) return _cachedDefaultSlug
  try {
    const res = await fetch(`${origin}/api/internal/default-tenant`, { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json() as { slug: string }
      _cachedDefaultSlug = json.slug ?? ''
      _cacheExpiry = Date.now() + 60_000
    }
  } catch {
    // Mantener valor cacheado o caer en env var
  }
  return _cachedDefaultSlug ?? (process.env.DEFAULT_TENANT_SLUG ?? '')
}

function extractSubdomain(hostname: string): string | null {
  // Strip port
  const host = hostname.split(':')[0]

  // Exact match: root domain or www
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null

  const suffix = `.${BASE_DOMAIN}`
  if (host.endsWith(suffix)) {
    return host.slice(0, -suffix.length) || null
  }

  // Local dev: *.localhost (e.g. admin.localhost, cafeazul.localhost)
  if (BASE_DOMAIN === 'localhost' && host.endsWith('.localhost')) {
    return host.slice(0, -'.localhost'.length) || null
  }

  // LAN/WiFi via nip.io: subdomain.192.168.1.4.nip.io
  const nipMatch = host.match(/^([^.]+)\.\d+\.\d+\.\d+\.\d+\.nip\.io$/)
  if (nipMatch) return nipMatch[1]

  return null
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-slug',
  'Access-Control-Max-Age': '86400',
}

export async function middleware(request: NextRequest) {
  // Respond to CORS preflight before any redirect logic
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  const host = request.headers.get('host') ?? ''
  const { pathname } = request.nextUrl

  // Evitar interceptar la API interna que el propio middleware consulta
  if (pathname.startsWith('/api/internal/')) {
    return NextResponse.next()
  }

  const subdomain = extractSubdomain(host)

  // ── Superadmin subdomain ──────────────────────────────────────────────────
  if (subdomain === 'admin') {
    const url = request.nextUrl.clone()
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-is-superadmin', 'true')

    // Rewrite to /superadmin/* unless already there (never rewrite API, _next, or static files)
    const isStaticFile = /\.[\w]+$/.test(pathname)
    if (!pathname.startsWith('/superadmin') && !pathname.startsWith('/_next') && !pathname.startsWith('/api') && !isStaticFile) {
      url.pathname = pathname === '/' ? '/superadmin' : `/superadmin${pathname}`
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ── Tenant subdomain ──────────────────────────────────────────────────────
  if (subdomain) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-tenant-slug', subdomain)

    // Redirect bare root to dashboard
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ── Mobile app: tenant slug sent explicitly in header ────────────────────
  const clientSlug = request.headers.get('x-tenant-slug')
  if (clientSlug) {
    return NextResponse.next()
  }

  // ── Default tenant fallback (Fase 1: acceso por IP sin subdominio) ──────────
  const defaultSlug = await resolveDefaultTenantSlug(request.nextUrl.origin)
  if (defaultSlug) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-tenant-slug', defaultSlug)

    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ── Root domain → redirect to superadmin ─────────────────────────────────
  if (!pathname.startsWith('/superadmin') && !pathname.startsWith('/_next') && !pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/superadmin'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
