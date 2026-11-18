/**
 * Helpers shared across Trustly transform files.
 *
 * Unlike card processors, Trustly represents money as a *major-unit decimal
 * string* — e.g. `"10.00"` for ten euros, `"99.50"` for ninety-nine fifty.
 * The canonical payments schema stores integer minor units, so every amount is
 * routed through `toMinorUnits` here.
 *
 * Currency arrives as an upper-case ISO 4217 code already (`"EUR"`, `"SEK"`,
 * `"USD"`), but we normalise defensively.
 */

/**
 * Convert a Trustly major-unit decimal string (or number) into integer minor
 * units. `"10.00"` → `1000`, `"99.5"` → `9950`. Returns `0` for missing /
 * unparseable input — transforms never throw.
 */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Normalise a Trustly currency code to upper-case ISO 4217, defaulting EUR. */
export function pickCurrency(v: string | null | undefined): string {
  const code = (v ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : 'EUR'
}

/** Collapse an arbitrary record into a `Record<string, string>` metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}
