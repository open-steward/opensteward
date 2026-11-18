/**
 * Transform helpers for Tyro Reporting responses (charge, payout).
 */

export function toIsoDatetime(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Amounts are documented "in cents"; anything else is an error, not a zero. */
export function requireCents(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Tyro ${what} is not an integer number of cents: ${String(value)}`)
  }
  return value
}

export function requireCurrency(value: string): string {
  const c = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) {
    throw new Error(`Tyro connection currency is not an ISO 4217 code: ${JSON.stringify(value)}`)
  }
  return c
}

/** A string map of the defined, non-null values. */
export function compactMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}
