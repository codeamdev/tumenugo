import { DEBUG } from '@/lib/env'

export { DEBUG }

/**
 * En modo DEBUG devuelve el mensaje real del error.
 * En producción devuelve siempre el fallback para no exponer internals al cliente.
 */
export function apiError(err: unknown, fallback = 'Error interno'): string {
  if (!DEBUG) return fallback
  if (err instanceof Error) return `[DEBUG] ${err.message}`
  return `[DEBUG] ${String(err)}`
}
