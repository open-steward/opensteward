/**
 * Helpers shared across HitPay transform files.
 *
 * HitPay expresses money as a decimal string in MAJOR units (e.g. "100.00",
 * "13", "0.50"). The canonical schema wants integer MINOR units, so every
 * amount must be scaled by 100. Currency codes arrive lowercase (e.g. "sgd")
 * and must be upper-cased to satisfy the ISO 4217 primitive.
 */

/**
 * Scale a major-unit decimal (string or number) to integer minor units.
 * Returns 0 when the input is missing or unparseable — transforms never throw.
 * Uses string-rounding to dodge binary-float drift (e.g. 1.1 * 100 = 110.000…1).
 */
export function toMinorUnits(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Upper-case a HitPay currency code (e.g. "sgd" → "SGD"); default "SGD". */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'SGD').toUpperCase()
}

/** Build a canonical string→string metadata map, dropping null/undefined. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}
