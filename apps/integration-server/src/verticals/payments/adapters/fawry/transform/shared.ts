/**
 * Helpers shared across FawryPay transform files.
 *
 * Fawry represents money as a *decimal major unit* (`orderAmount: 10.00`,
 * `paymentAmount: 10.00`) in Egyptian pounds — unlike the canonical
 * `Charge`/`Refund` schema, which uses integer minor units. `toMinorUnits`
 * converts on the way in; `toMajorAmount` formats the two-decimal string
 * Fawry expects (and that feeds the request signature) on the way out.
 *
 * Fawry has no zero-decimal currency in its supported set (EGP has 100
 * piastres), so a flat factor of 100 is correct.
 */
import { DEFAULT_CURRENCY } from '../constants'

const MINOR_UNIT_FACTOR = 100

/** Decimal major-unit amount → integer minor units (e.g. 10.00 EGP → 1000). */
export function toMinorUnits(amount: number | string | null | undefined): number {
  if (amount == null || amount === '') return 0
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (Number.isNaN(n)) return 0
  return Math.round(n * MINOR_UNIT_FACTOR)
}

/** Integer minor units → Fawry's two-decimal major-unit string (1000 → "10.00"). */
export function toMajorAmount(minor: number | null | undefined): string {
  if (minor == null || Number.isNaN(minor)) return '0.00'
  return (minor / MINOR_UNIT_FACTOR).toFixed(2)
}

/** Default currency EGP; always upper-cased to satisfy the ISO 4217 schema. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/**
 * Fawry payload values are scalars (or small nested objects for items);
 * the canonical schema requires `Record<string, string>`. Coerce every
 * non-null value and drop nulls — never throw.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
