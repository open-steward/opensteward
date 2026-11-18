/**
 * Helpers shared across iyzico transform files.
 *
 * iyzico returns monetary amounts as DECIMAL major units (e.g. `1.2`, `120.00`,
 * or the string `"1.20000000"`), where the canonical schema wants integer minor
 * units. iyzico is TRY-first but settles many currencies, so `currency`
 * defaults to TRY when upstream omits it.
 */

/** Normalise an upstream currency code, defaulting to TRY. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'TRY').toUpperCase()
}

/**
 * Convert an iyzico decimal-major amount (number or string) to integer minor
 * units. Returns `undefined` for missing input, matching the
 * missing-rather-than-wrong canonical contract. Rounds to the nearest minor
 * unit to absorb the float artefacts iyzico's serialiser emits.
 */
export function toMinorUnits(v: number | string | null | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

/** Coerce an arbitrary value into a string map, dropping null/undefined. */
export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}
