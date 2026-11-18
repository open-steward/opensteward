/**
 * Helpers shared across Rapyd transform files.
 *
 * Two Rapyd-specific quirks the canonical schema does not share:
 *   - Money is reported in DECIMAL MAJOR units (e.g. `50.00`, `1234.5`), whereas
 *     the canonical schema is integer MINOR units. `toMinorUnits` converts.
 *   - Timestamps are Unix seconds (numbers). We normalise every one through
 *     `toIsoDatetime` so canonical date fields are always strict ISO-8601.
 *
 * Per the canonical contract, transforms never throw: bad/missing optionals
 * collapse to `undefined`.
 */
import { majorToMinor } from '@opensteward/shared'
export { toIsoDatetime } from '@opensteward/shared'

/** Three-letter ISO 4217, uppercased; falls back to USD when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/**
 * Decimal major-unit amount → integer minor units. Rounds to the nearest
 * minor unit to absorb float noise. `null`/missing → 0 so canonical `amount`
 * (a required field) always has a value.
 */
export function toMinorUnits(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Coerce any value into a string map, dropping null/undefined entries. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}

/** Narrow an unknown to a non-empty string, else undefined. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v === null || v === undefined) return undefined
  const s = String(v)
  return s.length > 0 ? s : undefined
}

/**
 * A required three-letter currency, or a throw naming what lacked it. The
 * rebuilt transforms (invoice, payout, plan) use this instead of
 * `pickCurrency`, which defaults to USD.
 */
export function requireCurrency(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Rapyd ${what} has no currency`)
  }
  return v.trim().toUpperCase()
}

/**
 * A required decimal major-unit amount in minor units for `currency`, or a
 * throw naming what lacked it. Rapyd money is decimal major units ("Decimal,
 * including the correct number of decimal places for the currency exponent",
 * https://docs.rapyd.net/en/list-payouts.html), so the exponent comes from
 * the currency via `majorToMinor`, never a hard-coded 100.
 */
export function requireMinor(v: unknown, currency: string, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`Rapyd ${what} has no amount`)
  }
  return majorToMinor(n, currency)
}

/** An optional decimal major-unit amount in minor units, or undefined when absent. */
export function optionalMinor(v: unknown, currency: string): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return majorToMinor(n, currency)
}
