/**
 * Helpers shared across Helcim transform files.
 *
 * Helcim represents money as **decimal dollars** on the wire (e.g.
 * `"amount": 100.99`), while the canonical schema is integer **minor units**
 * (cents). `toMinorUnits` converts; rounding guards against float drift.
 *
 * Helcim defaults to CAD (Canada-first gateway) but also settles USD; we
 * uppercase whatever `currency` the API returns and fall back to CAD.
 */

/** Decimal dollars → integer minor units (cents). Never throws. */
export function toMinorUnits(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Integer minor units (cents) → decimal dollars for outbound requests. */
export function toMajorUnits(minor: number | null | undefined): number | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  return minor / 100
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'CAD').toUpperCase()
}

/**
 * Coerce an arbitrary record into the canonical `Record<string, string>`
 * metadata map: stringify scalars, JSON-encode objects, drop null/undefined.
 * Never throws.
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
