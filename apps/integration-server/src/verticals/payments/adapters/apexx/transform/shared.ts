/**
 * Helpers shared across APEXX transform files.
 *
 * APEXX represents money as integer minor units already (it submits/returns
 * amounts without a decimal point and infers the decimal position from the
 * `currency`), so no float coercion is needed — the canonical schema carries
 * minor units too. Transforms NEVER throw: missing optionals collapse to
 * `undefined` (missing-rather-than-wrong).
 */

/** Default to GBP, APEXX's primary settlement currency, when none is present. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'GBP').toUpperCase()
}

/** Coerce a value to an integer of minor units, or `undefined` when absent. */
export function pickAmount(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : undefined
}

/** Build a canonical string-map metadata object, dropping null/undefined. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v == null) return undefined
  return String(v)
}
