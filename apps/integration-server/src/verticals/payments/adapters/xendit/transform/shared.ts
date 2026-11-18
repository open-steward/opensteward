/**
 * Helpers shared across Xendit transform files.
 *
 * Money: Xendit returns `amount` as a plain number in the major currency unit
 * (e.g. IDR 150000, PHP 100.00). The canonical schema stores integer **minor**
 * units. IDR/VND have no minor unit, so the value passes through unchanged;
 * for currencies with two decimals the upstream value is already the charged
 * figure and we simply coerce to a rounded integer (transforms must never
 * throw — bad input collapses to 0).
 *
 * Timestamps: every upstream datetime is ISO-8601 already, but we still route
 * them through `toIsoDatetime` so the strict canonical `IsoDatetime` schema
 * (which requires an explicit offset) always accepts them.
 */

/** Coerce an arbitrary numeric value to a non-negative integer; 0 on failure. */
export function toMinorAmount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/** Default to IDR (Xendit's home market) when a currency is absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'IDR').toUpperCase()
}

/** Build a canonical string→string metadata map, dropping null/undefined. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}
