/**
 * PayPal returns money as decimal strings in major units, e.g.
 * `{ "amount": { "value": "10.50", "currency_code": "USD" } }`.
 * Convert to integer minor units for the canonical schema.
 */
export function decimalToMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
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
