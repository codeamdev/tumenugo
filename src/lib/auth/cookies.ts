import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { REFRESH_TTL_MS } from './jwt'

const IS_PROD = process.env.NODE_ENV === 'production'
// COOKIE_SECURE=false permite cookies en HTTP (fase 1 sin HTTPS)
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false' && IS_PROD

// Cookie names
export const ACCESS_COOKIE = 'cf_access'
export const REFRESH_COOKIE = 'cf_refresh'
export const SA_ACCESS_COOKIE = 'cf_sa_access'
export const SA_REFRESH_COOKIE = 'cf_sa_refresh'

function cookieNames(type: 'tenant' | 'superadmin') {
  return type === 'superadmin'
    ? { access: SA_ACCESS_COOKIE, refresh: SA_REFRESH_COOKIE }
    : { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE }
}

const BASE_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
}

// Para route handlers: establece cookies directamente en el NextResponse
export function setAuthCookiesOnResponse(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  type: 'tenant' | 'superadmin'
): void {
  const { access, refresh } = cookieNames(type)
  const opts = { ...BASE_COOKIE, secure: COOKIE_SECURE }
  response.cookies.set(access,  accessToken,  { ...opts, maxAge: 15 * 60 })
  response.cookies.set(refresh, refreshToken, { ...opts, maxAge: REFRESH_TTL_MS / 1000 })
}

// Para Server Actions / middleware donde no hay NextResponse disponible
export function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  type: 'tenant' | 'superadmin'
): void {
  const store = cookies()
  const { access, refresh } = cookieNames(type)
  const opts = { ...BASE_COOKIE, secure: COOKIE_SECURE }
  store.set(access,  accessToken,  { ...opts, maxAge: 15 * 60 })
  store.set(refresh, refreshToken, { ...opts, maxAge: REFRESH_TTL_MS / 1000 })
}

export function clearAuthCookies(type: 'tenant' | 'superadmin'): void {
  const store = cookies()
  const accessName = type === 'superadmin' ? SA_ACCESS_COOKIE : ACCESS_COOKIE
  const refreshName = type === 'superadmin' ? SA_REFRESH_COOKIE : REFRESH_COOKIE

  store.delete(accessName)
  store.delete(refreshName)
}

export function getAccessToken(type: 'tenant' | 'superadmin'): string | undefined {
  const name = type === 'superadmin' ? SA_ACCESS_COOKIE : ACCESS_COOKIE
  return cookies().get(name)?.value
}

export function getRefreshToken(type: 'tenant' | 'superadmin'): string | undefined {
  const name = type === 'superadmin' ? SA_REFRESH_COOKIE : REFRESH_COOKIE
  return cookies().get(name)?.value
}
