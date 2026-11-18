/**
 * Cybersource returns money as decimal strings (`"100.00"`) in major
 * units paired with an ISO 4217 currency.
 */
export function decimalToMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
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
