import { majorToMinor } from '@opensteward/shared'

/** A documented string field, or undefined. */
export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Kill Bill amounts are major-unit decimals ("amount | number"); integer minor units per the row's own currency. */
export function toMinor(v: unknown, currency: string): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return majorToMinor(Number.isFinite(n) ? n : undefined, currency)
}

/** A required id: throws rather than inventing one. */
export function requireId(v: unknown, field: string, resource: string): string {
  const s = str(v)
  if (!s) throw new Error(`Kill Bill ${resource} has no ${field}`)
  return s
}

/** A required ISO currency code: throws rather than defaulting one. */
export function requireCurrency(v: unknown, resource: string): string {
  const s = str(v)
  if (!s) throw new Error(`Kill Bill ${resource} has no currency`)
  return s.toUpperCase()
}
