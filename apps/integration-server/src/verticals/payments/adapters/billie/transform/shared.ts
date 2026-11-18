/**
 * Helpers shared across Billie transform files.
 *
 * Billie represents money as `TaxedMoney { gross, net, tax }` decimals in
 * major units (euros), whereas the canonical payments schema uses integer
 * minor units (cents). `toMinorUnits` bridges the two. Datetimes arrive as
 * ISO-8601 strings already, but every assignment still runs through
 * `toIsoDatetime` so the strict canonical `IsoDatetime` shape is guaranteed.
 */
import { DEFAULT_CURRENCY } from '../constants'

/** Billie's `TaxedMoney` value object. All fields are decimal major units. */
export interface TaxedMoney {
  gross?: number | string | null
  net?: number | string | null
  tax?: number | string | null
}

/**
 * Convert a decimal major-unit amount (e.g. 260.27 EUR) to integer minor
 * units (26027 cents). Returns 0 for missing/unparseable input — the schema
 * requires a number, and a charge with no amount is degenerate rather than
 * optional.
 */
export function toMinorUnits(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

/** Gross amount of a `TaxedMoney` object, in minor units. */
export function grossMinor(m: TaxedMoney | null | undefined): number {
  return toMinorUnits(m?.gross)
}

/** Billie has no per-order currency field; it settles in euros. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** Coerce an arbitrary value into a flat string→string metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}
