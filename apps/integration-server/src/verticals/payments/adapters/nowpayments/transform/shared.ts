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
 * A documented currency field as the canonical 3-letter upper-case code.
 *
 * NOWPayments sends tickers in lower case ("usd", "trx"). There is no default:
 * a missing or non-3-letter code (a network-suffixed ticker such as
 * "usdttrc20") cannot fill the canonical `Iso4217Currency`, so it throws
 * rather than guessing.
 */
export function requireCurrency(v: unknown, what: string): string {
  const code = typeof v === 'string' ? v.toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`NOWPayments ${what}: currency ${JSON.stringify(v)} is not a 3-letter code`)
  }
  return code
}

/** A documented id field as a string; throws when it is absent. */
export function requireId(v: unknown, what: string): string {
  if (typeof v === 'string' && v !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  throw new Error(`NOWPayments ${what}: missing id`)
}

/** A documented decimal amount (number or numeric string) in major units. */
export function requireAmount(v: unknown, what: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n))
    throw new Error(`NOWPayments ${what}: amount ${JSON.stringify(v)} is not a number`)
  return n
}
