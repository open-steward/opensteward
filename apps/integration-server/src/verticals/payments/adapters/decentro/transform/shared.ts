/**
 * Helpers shared across Decentro transform files.
 *
 * Decentro represents money as decimal rupees (e.g. `100.50`), whereas the
 * canonical payments schema stores integer minor units (paise). `toMinorUnits`
 * does the ×100 conversion with rounding to avoid float drift. Decentro settles
 * exclusively in INR.
 */
import { DEFAULT_CURRENCY, MINOR_UNITS_MULTIPLIER } from '../constants'

/** Decimal rupees → integer paise. Missing/garbage input → undefined. */
export function toMinorUnits(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * MINOR_UNITS_MULTIPLIER)
}

/** All Decentro money is INR. */
export function pickCurrency(): string {
  return DEFAULT_CURRENCY
}

/** Coerce an arbitrary object into a `Record<string, string>`, dropping nulls. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}
