export function pickCurrency(v: string | null | undefined, fallback = 'USD'): string {
  if (!v || typeof v !== 'string') return fallback
  return v.toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

/**
 * Safely convert an amount in major units (e.g. dollars) to minor units (cents).
 * If the platform already returns minor units, pass the value through.
 */
export function toMinorUnits(amount: unknown, factor = 100): number {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'))
  if (!isFinite(n)) return 0
  return Math.round(n * factor)
}
