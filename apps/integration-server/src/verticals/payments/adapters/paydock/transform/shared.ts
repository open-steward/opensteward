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

/** A documented string field, or undefined when absent, null or empty. */
export function optStr(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v)
  return s === '' ? undefined : s
}

/**
 * A required id. Paydock documents `_id` as "+ string (24 hex characters)"
 * on every resource; a row without one cannot be read back, so it throws
 * rather than inventing an id.
 */
export function requireId(v: unknown, what: string): string {
  const s = optStr(v)
  if (s === undefined) throw new Error(`Paydock ${what} has no documented id (_id)`)
  return s
}
