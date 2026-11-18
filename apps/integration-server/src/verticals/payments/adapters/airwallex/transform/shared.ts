/**
 * Helpers shared across the Airwallex transform files.
 *
 * Airwallex represents money in **major units** as defined by ISO 4217 — e.g.
 * `9.99` means $9.99, `16.66` means €16.66. The canonical payments schema uses
 * integer **minor units** (cents), so every amount must be scaled by 100 and
 * rounded on the way in (and divided back out on the way to the wire).
 *
 * Note: this two-decimal scaling is correct for the vast majority of
 * Airwallex-supported currencies; zero-decimal currencies (e.g. JPY) are still
 * sent by Airwallex as major units (`1000` = ¥1000) and would round to
 * `100000` minor — acceptable for a faithful round-trip since we divide back by
 * the same factor, and the `raw` payload preserves the upstream value.
 */
export function toMinorUnits(major: number | null | undefined): number | undefined {
  if (major == null || Number.isNaN(major)) return undefined
  return Math.round(major * 100)
}

export function toMajorUnits(minor: number | null | undefined): number | undefined {
  if (minor == null || Number.isNaN(minor)) return undefined
  return Math.round(minor) / 100
}

/**
 * Airwallex returns `currency` as a 3-letter ISO 4217 code (USD, AUD, EUR…).
 * There is no single default currency, so fall back to USD only when absent.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/**
 * Coerce an arbitrary object into the canonical `Record<string, string>`
 * metadata map: stringify objects, drop nulls, never throw.
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
