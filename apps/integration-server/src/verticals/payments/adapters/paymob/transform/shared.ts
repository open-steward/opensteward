/**
 * Helpers shared across Paymob transform files.
 *
 * Paymob represents money as integer minor units (piasters/cents) already, so
 * no float coercion is needed. Currency defaults to EGP unless the transaction
 * carries an explicit code (multi-currency merchants). Fields arrive snake_case
 * on the wire and are mapped to camelCase in TS.
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

/** Coerce a possibly-string flag into a boolean (`"true"`, `1`, `true`). */
export function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1'
  return false
}
