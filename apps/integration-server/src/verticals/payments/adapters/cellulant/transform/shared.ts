/**
 * Helpers shared across the Cellulant (Tingg) transform files.
 *
 * Tingg expresses money in MAJOR units as a decimal string or number
 * (e.g. `"100.00"`), while the canonical schema stores integer MINOR units.
 * `toMinorUnits` converts major → minor (×100) with rounding so the canonical
 * `amount` is always an integer. Currencies are ISO 4217; Tingg is Kenya-first
 * so we default to KES when the field is absent.
 */

/** Convert a Tingg major-unit decimal (string/number) to integer minor units. */
export function toMinorUnits(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Tingg currency codes are ISO 4217; default to KES (Kenya-first). */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'KES').toUpperCase()
}

/** Collapse an arbitrary object into a string→string map, dropping nullish. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

/** Narrow an unknown to a trimmed non-empty string, else undefined. */
export function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}
