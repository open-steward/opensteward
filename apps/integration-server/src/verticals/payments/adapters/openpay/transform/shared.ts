import { majorToMinor } from '@opensteward/shared'

export function pickCurrency(v: string | null | undefined, fallback = 'USD'): string {
  if (!v || typeof v !== 'string') return fallback
  return v.toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

/**
 * Safely convert an amount in major units (e.g. dollars) to minor units (cents).
 * If the platform already returns minor units, pass the value through.
 */
export function toMinorUnits(amount: unknown, factor = 100): number {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'))
  if (!isFinite(n)) return 0
  return Math.round(n * factor)
}

/**
 * Safely parse a number and return 0 if invalid.
 */
export function safeInt(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  const n = parseInt(String(v ?? '0'), 10)
  return isFinite(n) ? n : 0
}

/**
 * The documented `currency` of an Openpay record, upper-cased. Never defaulted:
 * a record without one is not mapped.
 */
export function requireCurrency(raw: Record<string, unknown>, what: string): string {
  const c = raw['currency']
  if (typeof c !== 'string' || c.trim() === '') {
    throw new Error(`Openpay ${what} ${String(raw['id'])} has no currency`)
  }
  return c.trim().toUpperCase()
}

/**
 * The documented major-unit `amount` ("Cantidad de la transacción a dos
 * decimales.") as minor units of `currency`. Never defaulted.
 */
export function requireMinorAmount(
  raw: Record<string, unknown>,
  currency: string,
  what: string,
): number {
  const a = raw['amount']
  const minor = typeof a === 'number' ? majorToMinor(a, currency) : undefined
  if (minor === undefined) {
    throw new Error(`Openpay ${what} ${String(raw['id'])} has no numeric amount`)
  }
  return minor
}

/** The documented `id`, which every Openpay object carries. */
export function requireId(raw: Record<string, unknown>, what: string): string {
  const id = raw['id']
  if (typeof id !== 'string' || id === '') throw new Error(`Openpay ${what} has no id`)
  return id
}

export function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}
