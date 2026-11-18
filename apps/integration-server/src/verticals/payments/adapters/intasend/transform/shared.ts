/**
 * Helpers shared across IntaSend transform files.
 *
 * IntaSend reports money as **decimal strings in major units** (e.g.
 * `"10.36"` for KES 10.36), whereas the canonical payment schemas use
 * **integer minor units**. `toMinorUnits` converts major→minor by scaling by
 * 100 and rounding to the nearest integer. It never throws — unparseable
 * input collapses to `undefined` so optional fields stay missing-rather-than-
 * wrong.
 *
 * IntaSend currencies are ISO 4217 (KES, USD, GBP, EUR); KES is the default
 * when the field is absent.
 */
export function toMinorUnits(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'KES').toUpperCase()
}

/**
 * Coerce an arbitrary value into the canonical `Record<string, string>`
 * metadata map. Nulls are dropped; objects are JSON-stringified; everything
 * else is `String()`-coerced. Never throws.
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
