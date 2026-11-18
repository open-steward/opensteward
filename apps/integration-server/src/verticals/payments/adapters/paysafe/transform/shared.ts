/**
 * Helpers shared across Paysafe transform files.
 *
 * Paysafe represents money in minor units already (a consistent 2-decimal
 * shift across every currency — e.g. USD $100.00 → 10000), which matches the
 * canonical `amount` contract, so no float coercion is needed. Currency ships
 * as an ISO-4217 `currencyCode`. Timestamps are ISO-8601 (`txnTime`).
 */

/** Coerce a Paysafe currencyCode to an uppercase ISO-4217 string. */
export function pickCurrency(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  return v.toUpperCase()
}

/** Build a flat string→string metadata map, dropping null/undefined. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

/** Coerce to a non-empty string or undefined. */
export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v == null) return undefined
  return String(v)
}

/** Coerce to a finite number or undefined. */
export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
