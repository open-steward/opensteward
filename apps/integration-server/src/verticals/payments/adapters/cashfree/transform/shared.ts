/**
 * Cashfree quotes money in MAJOR units (whole rupees with up to two decimal
 * places, e.g. `order_amount: 22` or `1.5`), not minor units. The canonical
 * schema is integer minor units, so every amount must be scaled by 100.
 * Default currency is INR.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'INR').toUpperCase()
}

/** Major-unit (rupees) → minor-unit (paise) integer. Returns 0 for non-finite. */
export function toMinorUnits(major: number | string | null | undefined): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Minor-unit (paise) → major-unit (rupees) for outbound request bodies. */
export function toMajorUnits(minor: number | null | undefined): number | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  return minor / 100
}

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
