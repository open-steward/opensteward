/**
 * Helpers shared across Nuvei transform files.
 *
 * Nuvei reports money as a decimal *major-unit* string (e.g. `"10.50"` USD),
 * whereas the canonical payments schema stores integer minor units. We convert
 * with a fixed 2-decimal assumption — every currency Nuvei supports on the S2S
 * API is a 2-exponent currency — and round to guard against float drift.
 *
 * Per the canonical transform contract, every helper returns `undefined` for
 * missing input rather than throwing.
 */

/** Decimal major-unit string → integer minor units (cents). */
export function toMinorUnits(amount: string | number | null | undefined): number | undefined {
  if (amount === null || amount === undefined || amount === '') return undefined
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

/** Default to USD when Nuvei omits the currency on a response. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}
