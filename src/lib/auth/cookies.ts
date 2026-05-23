import { cookies } from 'next/headers'
import { REFRESH_TTL_MS } from './jwt'

const IS_PROD = process.env.NODE_ENV === 'production'

// Cookie names
export const ACCESS_COOKIE = 'cf_access'
export const REFRESH_COOKIE = 'cf_refresh'
export const SA_ACCESS_COOKIE = 'cf_sa_access'
export const SA_REFRESH_COOKIE = 'cf_sa_refresh'

interface SetCookieOptions {
  name: string
  value: string
  maxAge?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
}

export function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  type: 'tenant' | 'superadmin'
): void {
  const store = cookies()
  const accessName = type === 'superadmin' ? SA_ACCESS_COOKIE : ACCESS_COOKIE
  const refreshName = type === 'superadmin' ? SA_REFRESH_COOKIE : REFRESH_COOKIE

  const base: Partial<SetCookieOptions> = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
  }

  store.set(accessName, accessToken, {
    ...base,
    maxAge: 15 * 60,
  })

  store.set(refreshName, refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_MS / 1000,
  })
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
